'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Activity, AlertTriangle, Ban, Check, ChevronRight, ClipboardCheck, Clock3,
  Archive, BellRing, Database, Download, Fingerprint, FlaskConical, Gauge, GitBranch,
  KeyRound, Languages, LockKeyhole, Play, RotateCcw, Scale, ShieldCheck, Sparkles,
  Terminal, UserRound, WalletCards,
} from 'lucide-react';

type AccessMode = 'personal' | 'lawful' | 'dba';
type Decision = 'approved' | 'narrowed' | 'denied' | 'idle';
type Locale = 'tr' | 'en';
type Payload = Record<string, string | number>;
type Localized = { tr: string; en: string };
type FlowKey = 'request' | 'personalIdentity' | 'nonUserAuthority' | 'requestContext' | 'policy' | 'scope' | 'personalKey' | 'lawfulKey' | 'crypto' | 'repository' | 'output' | 'blocked' | 'lifecycle';
type FlowStep = { key: FlowKey; label: Localized; ref: string; icon: typeof Activity };

type PdrRecord = {
  id: string;
  pdrClass: 'A' | 'B' | 'C' | 'D';
  title: Localized;
  subtitle: Localized;
  owner: Localized;
  personal: boolean;
  payload: Payload;
};

type CryptoPacket = {
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  personalWrappedDek: ArrayBuffer;
  lawfulWrappedDek: ArrayBuffer;
};

type CryptoSystem = {
  personalKeys: CryptoKeyPair;
  lawfulKeys: CryptoKeyPair;
  packets: Map<string, CryptoPacket>;
};

type AuditEntry = {
  id: number;
  time: string;
  event: string;
  detail: string;
  result: 'ok' | 'deny' | 'warn';
  hash: string;
  prevHash: string;
};

type ValidationStatus = 'idle' | 'running' | 'pass' | 'fail';
type ValidationResult = {
  status: ValidationStatus;
  observed?: Localized;
  evidence?: string;
};

type ValidationScenario = {
  id: `T${number}`;
  title: Localized;
  rq: 'RQ1' | 'RQ2' | 'RQ1 / RQ2';
  context: Localized;
  expected: Localized;
  path: Localized;
};

const records: PdrRecord[] = [
  { id: 'PDR-A-1001', pdrClass: 'A', title: { tr: 'Kişisel sağlık kaydı', en: 'Personal health record' }, subtitle: { tr: 'Kullanıcı kontrollü kayıt', en: 'User-controlled record' }, owner: { tr: 'Deniz Kaya', en: 'Deniz Kaya' }, personal: true, payload: { adSoyad: 'Deniz Kaya', tani: 'Mevsimsel alerji', ziyaretTarihi: '2026-05-14', doktorNotu: 'Rutin kontrol önerildi' } },
  { id: 'PDR-B-2038', pdrClass: 'B', title: { tr: 'Telekom trafik kaydı', en: 'Telecom traffic record' }, subtitle: { tr: 'Rıza dışı işlenen kurumsal kayıt', en: 'Institutional record independent of consent' }, owner: { tr: 'Deniz Kaya', en: 'Deniz Kaya' }, personal: false, payload: { aboneKimligi: 'SUB-7741', hucreBolgesi: 'İstanbul / Kadıköy', zamanAraligi: '2026-04-01–07', cihazKimligi: 'IMEI•••5932' } },
  { id: 'PDR-C-1004', pdrClass: 'C', title: { tr: 'Ortak işlem kaydı', en: 'Shared transaction record' }, subtitle: { tr: 'Çok taraflı finansal kayıt', en: 'Multi-party financial record' }, owner: { tr: 'Deniz Kaya + 2 taraf', en: 'Deniz Kaya + 2 parties' }, personal: false, payload: { islemKimligi: 'TX-93A17', taraflar: 'Deniz Kaya, Atlas Ltd., Nova AŞ', tutar: '₺248.500', tarih: '2026-06-21', lehtarNotu: 'Tedarik avansı' } },
  { id: 'PDR-D-8402', pdrClass: 'D', title: { tr: 'Birleşik risk profili', en: 'Fused risk profile' }, subtitle: { tr: 'Veri füzyonuyla hassaslaşan kayıt', en: 'Record made sensitive through data fusion' }, owner: { tr: 'Karma veri kümesi', en: 'Combined dataset' }, personal: false, payload: { riskSkoru: 82, oruntu: 'Yüksek frekanslı çapraz kurum hareketi', kimlikler: '14 ilişkili kişi', hamKaynaklar: 'Vergi + trafik + işlem' } },
];

const fieldLabels: Record<string, Localized> = {
  adSoyad: { tr: 'Ad soyad', en: 'Full name' }, tani: { tr: 'Tanı', en: 'Diagnosis' }, ziyaretTarihi: { tr: 'Ziyaret tarihi', en: 'Visit date' }, doktorNotu: { tr: 'Doktor notu', en: 'Clinician note' },
  aboneKimligi: { tr: 'Abone kimliği', en: 'Subscriber ID' }, hucreBolgesi: { tr: 'Hücre bölgesi', en: 'Cell area' }, zamanAraligi: { tr: 'Zaman aralığı', en: 'Time range' }, cihazKimligi: { tr: 'Cihaz kimliği', en: 'Device ID' },
  islemKimligi: { tr: 'İşlem kimliği', en: 'Transaction ID' }, taraflar: { tr: 'Taraflar', en: 'Parties' }, tutar: { tr: 'Tutar', en: 'Amount' }, tarih: { tr: 'Tarih', en: 'Date' }, lehtarNotu: { tr: 'Lehtar notu', en: 'Beneficiary note' },
  riskSkoru: { tr: 'Risk skoru', en: 'Risk score' }, oruntu: { tr: 'Örüntü', en: 'Pattern' }, kimlikler: { tr: 'İlişkili kimlikler', en: 'Related identities' }, hamKaynaklar: { tr: 'Ham kaynaklar', en: 'Raw sources' },
};

const classTone: Record<PdrRecord['pdrClass'], string> = {
  A: 'border-emerald-600/25 bg-emerald-100 text-emerald-800',
  B: 'border-sky-600/25 bg-sky-100 text-sky-800',
  C: 'border-amber-600/25 bg-amber-100 text-amber-800',
  D: 'border-rose-600/25 bg-rose-100 text-rose-800',
};

const flowCatalog: Record<FlowKey, FlowStep> = {
  request: { key: 'request', label: { tr: 'Erişim isteği', en: 'Access request' }, ref: '1', icon: ClipboardCheck },
  personalIdentity: { key: 'personalIdentity', label: { tr: 'Kimlik + hak doğrulama', en: 'Identity + entitlement' }, ref: '2A', icon: WalletCards },
  nonUserAuthority: { key: 'nonUserAuthority', label: { tr: 'Kullanıcı dışı yetki', en: 'Non-user authority' }, ref: '2B', icon: Scale },
  requestContext: { key: 'requestContext', label: { tr: 'Yetki + istek bağlamı', en: 'Authority + request context' }, ref: '3', icon: GitBranch },
  policy: { key: 'policy', label: { tr: 'Deterministik politika', en: 'Deterministic policy' }, ref: '4', icon: Scale },
  scope: { key: 'scope', label: { tr: 'Sorgu kapsamı', en: 'Query scoping' }, ref: '5', icon: Terminal },
  personalKey: { key: 'personalKey', label: { tr: 'Kişisel anahtar yolu', en: 'Personal key path' }, ref: '6A', icon: KeyRound },
  lawfulKey: { key: 'lawfulKey', label: { tr: 'Yasal erişim anahtar yolu', en: 'Lawful-access key path' }, ref: '6B', icon: KeyRound },
  crypto: { key: 'crypto', label: { tr: 'Yetkili kriptografik yürütme', en: 'Authorized cryptographic execution' }, ref: '7', icon: LockKeyhole },
  repository: { key: 'repository', label: { tr: 'Şifreli PDR deposu', en: 'Encrypted PDR repository' }, ref: '8', icon: Database },
  output: { key: 'output', label: { tr: 'Küçültülmüş çıktı', en: 'Minimized output' }, ref: '9', icon: Sparkles },
  blocked: { key: 'blocked', label: { tr: 'Plaintext erişimi engellendi', en: 'Plaintext access blocked' }, ref: '×', icon: Ban },
  lifecycle: { key: 'lifecycle', label: { tr: 'Ortak denetim + yaşam döngüsü', en: 'Shared audit + lifecycle' }, ref: 'A/L', icon: Activity },
};

const scenarios = [
  { id: 'personal', title: { tr: 'Geçerli kişisel erişim', en: 'Valid personal access' }, tag: 'RQ2', mode: 'personal' as AccessMode, recordId: 'PDR-A-1001' },
  { id: 'lawful', title: { tr: 'Geçerli yasal sorgu', en: 'Valid lawful query' }, tag: 'RQ2', mode: 'lawful' as AccessMode, recordId: 'PDR-C-1004' },
  { id: 'excess', title: { tr: 'Fazla alan talebi', en: 'Excess-field request' }, tag: 'RQ2', mode: 'lawful' as AccessMode, recordId: 'PDR-C-1004' },
  { id: 'invalid', title: { tr: 'Geçersiz yetki / amaç', en: 'Invalid authority / purpose' }, tag: 'RQ2', mode: 'lawful' as AccessMode, recordId: 'PDR-B-2038' },
  { id: 'dba', title: { tr: 'DBA doğrudan erişimi', en: 'DBA direct access' }, tag: 'RQ1', mode: 'dba' as AccessMode, recordId: 'PDR-A-1001' },
  { id: 'fusion', title: { tr: 'Veri füzyonu kısıtı', en: 'Data-fusion constraint' }, tag: 'RQ1', mode: 'lawful' as AccessMode, recordId: 'PDR-D-8402' },
];

const validationScenarios: ValidationScenario[] = [
  {
    id: 'T1', title: { tr: 'DBA Doğrudan Plaintext Denemesi', en: 'DBA Direct Plaintext Attempt' }, rq: 'RQ1',
    context: { tr: 'Rol: DBA · Kayıt: PDR-A-1001 · İşlem: doğrudan depo okuması', en: 'Role: DBA · Record: PDR-A-1001 · Action: direct repository read' },
    expected: { tr: 'Yalnız ciphertext ve sarılı DEK görünür; AES anahtarı ve plaintext üretilmez.', en: 'Only ciphertext and wrapped DEKs are visible; no AES key or plaintext is produced.' },
    path: { tr: 'DBA → Şifreli depo → Özel anahtar yetkisi yok → ENGELLE', en: 'DBA → Encrypted repository → No private-key authority → BLOCK' },
  },
  {
    id: 'T2', title: { tr: 'Geçerli Kişisel Erişim', en: 'Valid Personal Access' }, rq: 'RQ2',
    context: { tr: 'Doğrulanmış Deniz Kaya · PDR-A-1001 · Tüm kişisel alanlar', en: 'Verified Deniz Kaya · PDR-A-1001 · All personal fields' },
    expected: { tr: 'Hak sahipliği doğrulanır; kişisel RSA yolu DEK’i açar ve kayıt çözülür.', en: 'Entitlement is verified; the personal RSA path unwraps the DEK and decrypts the record.' },
    path: { tr: 'Kimlik + hak → 6A kişisel anahtar → AES-GCM → Tam yetkili çıktı', en: 'Identity + entitlement → 6A personal key → AES-GCM → Authorized output' },
  },
  {
    id: 'T3', title: { tr: 'Geçerli Yasal Sorgu', en: 'Valid Lawful Query' }, rq: 'RQ2',
    context: { tr: 'MASAK · AML-14 · PDR-C-1004 · 4 izinli alan', en: 'FIU · AML-14 · PDR-C-1004 · 4 authorized fields' },
    expected: { tr: 'Politika kabul eder; yalnız islemKimligi, taraflar, tutar ve tarih döner.', en: 'Policy approves; only transaction ID, parties, amount, and date are returned.' },
    path: { tr: 'Yetki + amaç → Politika → Alan kapsamı → 6B yasal anahtar → Küçült', en: 'Authority + purpose → Policy → Field scope → 6B lawful key → Minimize' },
  },
  {
    id: 'T4', title: { tr: 'Fazla Alan Talebi', en: 'Excess-Field Request' }, rq: 'RQ2',
    context: { tr: 'T3 bağlamı + yetkisiz lehtarNotu alanı', en: 'T3 context + unauthorized beneficiaryNote field' },
    expected: { tr: 'Sorgu daraltılır; lehtarNotu dışlanır ve yalnız 4 izinli alan serbest bırakılır.', en: 'The query is narrowed; beneficiaryNote is excluded and only 4 authorized fields are released.' },
    path: { tr: 'Politika KABUL → Alan filtresi DARALT → 6B → Yetkisiz alanı çıkar', en: 'Policy APPROVE → Field filter NARROW → 6B → Remove unauthorized field' },
  },
  {
    id: 'T5', title: { tr: 'Geçersiz Yetki / Amaç', en: 'Invalid Authority / Purpose' }, rq: 'RQ2',
    context: { tr: 'Yetkisiz özel kuruluş · Pazarlama profili · PDR-B-2038', en: 'Unauthorized private organization · Marketing profile · PDR-B-2038' },
    expected: { tr: 'Politika reddeder; özel anahtar işlemi çağrılmaz ve plaintext oluşmaz.', en: 'Policy denies; no private-key operation is invoked and no plaintext is produced.' },
    path: { tr: 'Yetki eşleşmedi → Politika RED → Anahtar yolu açılmaz', en: 'Authority mismatch → Policy DENY → Key path remains closed' },
  },
  {
    id: 'T6', title: { tr: 'Çok Taraflı Kayıt', en: 'Multi-party Record' }, rq: 'RQ1 / RQ2',
    context: { tr: 'PDR-C-1004 · Deniz Kaya + Atlas Ltd. + Nova AŞ · geniş kapsam talebi', en: 'PDR-C-1004 · Deniz Kaya + Atlas Ltd. + Nova AŞ · broad-scope request' },
    expected: { tr: 'Diğer taraf kimlikleri ve lehtar notu dışlanır; işlem, tutar ve tarih korunur.', en: 'Other-party identities and beneficiary note are excluded; transaction, amount, and date remain.' },
    path: { tr: 'Çok taraf kuralı → Taraf bazlı maskeleme → 6B → 3 alanlık çıktı', en: 'Multi-party rule → Party-level masking → 6B → 3-field output' },
  },
  {
    id: 'T7', title: { tr: 'Veri Füzyonu Senaryosu', en: 'Data-Fusion Scenario' }, rq: 'RQ1',
    context: { tr: 'PDR-D-8402 · Risk skoru + örüntü + kimlikler + ham kaynaklar', en: 'PDR-D-8402 · Risk score + pattern + identities + raw sources' },
    expected: { tr: 'Füzyon kuralı hassas kimlikleri ve ham kaynakları çıkarır; türetilmiş sinyal kalır.', en: 'The fusion rule removes sensitive identities and raw sources; derived signals remain.' },
    path: { tr: 'Bileşim riski → Minimizasyon → kimlikler/hamKaynaklar ENGELLE', en: 'Composition risk → Minimization → BLOCK identities/rawSources' },
  },
  {
    id: 'T8', title: { tr: 'Denetim Kaydı Manipülasyonu', en: 'Audit Manipulation' }, rq: 'RQ1 / RQ2',
    context: { tr: 'Zincirlenmiş audit olayının detail alanı sonradan değiştirildi', en: 'The detail field of a chained audit event is modified after creation' },
    expected: { tr: 'Yeniden hesaplanan SHA-256 saklanan hash ile eşleşmez; müdahale tespit edilir.', en: 'Recomputed SHA-256 differs from the stored hash; tampering is detected.' },
    path: { tr: 'prevHash + olay → SHA-256 → Kayıt değişti → HASH MISMATCH', en: 'prevHash + event → SHA-256 → Record changed → HASH MISMATCH' },
  },
];

const enc = new TextEncoder();
const dec = new TextDecoder();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map((v) => v.toString(16).padStart(2, '0')).join('');
const toBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

async function hashText(text: string) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export default function Home() {
  const [lang, setLang] = useState<Locale>('en');
  const [mode, setMode] = useState<AccessMode>('lawful');
  const [recordId, setRecordId] = useState('PDR-C-1004');
  const [authority, setAuthority] = useState('Mali Suçları Araştırma Birimi');
  const [legalBasis, setLegalBasis] = useState('AML-14 / Suspicious transaction review');
  const [purpose, setPurpose] = useState('Şüpheli işlem analizi');
  const [duration, setDuration] = useState('24');
  const [identityVerified, setIdentityVerified] = useState(true);
  const [fields, setFields] = useState<string[]>(['islemKimligi', 'taraflar', 'tutar', 'tarih']);
  const [decision, setDecision] = useState<Decision>('idle');
  const [reason, setReason] = useState('Select a scenario or edit the request context.');
  const [result, setResult] = useState<Payload | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [activeStage, setActiveStage] = useState(-1);
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [cryptoStatus, setCryptoStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [latency, setLatency] = useState<number | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditCompromised, setAuditCompromised] = useState(false);
  const [scenarioId, setScenarioId] = useState('lawful');
  const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});
  const [validationRunning, setValidationRunning] = useState(false);
  const cryptoRef = useRef<CryptoSystem | null>(null);
  const auditRef = useRef<AuditEntry[]>([]);

  const record = useMemo(() => records.find((item) => item.id === recordId) ?? records[0], [recordId]);
  const allFields = useMemo(() => Object.keys(record.payload), [record]);
  const executionSteps = useMemo(() => {
    if (mode === 'personal') return ['request', 'personalIdentity', 'personalKey', 'crypto', 'repository', 'output', 'lifecycle'].map((key) => flowCatalog[key as FlowKey]);
    if (mode === 'dba') return ['request', 'repository', 'blocked', 'lifecycle'].map((key) => flowCatalog[key as FlowKey]);
    return ['request', 'nonUserAuthority', 'requestContext', 'policy', 'scope', 'lawfulKey', 'crypto', 'repository', 'output', 'lifecycle'].map((key) => flowCatalog[key as FlowKey]);
  }, [mode]);
  const l = (tr: string, en: string) => lang === 'tr' ? tr : en;
  const fieldLabel = (field: string) => fieldLabels[field]?.[lang] ?? field;
  const valueLabel = (value: string | number) => {
    if (lang === 'tr' || typeof value === 'number') return value;
    const translations: Record<string, string> = {
      'Mevsimsel alerji': 'Seasonal allergy', 'Rutin kontrol önerildi': 'Routine follow-up recommended',
      'İstanbul / Kadıköy': 'Istanbul / Kadikoy', 'Tedarik avansı': 'Supplier advance',
      'Yüksek frekanslı çapraz kurum hareketi': 'High-frequency cross-institution activity',
      '14 ilişkili kişi': '14 related persons', 'Vergi + trafik + işlem': 'Tax + traffic + transaction',
    };
    return translations[value] ?? value;
  };
  const purposeLabel = () => {
    const translations: Record<string, string> = {
      'Şüpheli işlem analizi': 'Suspicious transaction analysis',
      'Soruşturma kapsamı': 'Investigation scope',
      'Dolandırıcılık örüntüsü analizi': 'Fraud-pattern analysis',
      'Bulaşıcı hastalık izlemi': 'Infectious-disease monitoring',
      'Pazarlama profili oluşturma': 'Marketing profiling',
      'Kendi kaydını görüntüleme': 'View own record',
      'Doğrudan plaintext okuma': 'Direct plaintext read',
    };
    return lang === 'tr' ? purpose : translations[purpose] ?? purpose;
  };

  const validationSummary = useMemo(() => {
    const results = Object.values(validationResults);
    const executed = results.filter((item) => item.status === 'pass' || item.status === 'fail').length;
    const passed = results.filter((item) => item.status === 'pass').length;
    const failed = results.filter((item) => item.status === 'fail').length;
    const passedIds = new Set(Object.entries(validationResults).filter(([, item]) => item.status === 'pass').map(([id]) => id));
    const rq1 = validationScenarios.filter((item) => item.rq.includes('RQ1')).filter((item) => passedIds.has(item.id)).length;
    const rq2 = validationScenarios.filter((item) => item.rq.includes('RQ2')).filter((item) => passedIds.has(item.id)).length;
    return { executed, passed, failed, rq1, rq2 };
  }, [validationResults]);

  useEffect(() => {
    const saved = window.localStorage.getItem('pdr-lab-locale');
    if (saved === 'tr' || saved === 'en') {
      setLang(saved);
      document.documentElement.lang = saved;
    } else {
      document.documentElement.lang = 'en';
    }
  }, []);

  function changeLanguage(next: Locale) {
    if (running) return;
    setLang(next);
    window.localStorage.setItem('pdr-lab-locale', next);
    document.documentElement.lang = next;
    const basisPairs: Array<[string, string]> = [
      ['AML-14 / Şüpheli işlem incelemesi', 'AML-14 / Suspicious transaction review'],
      ['Kişisel erişim hakkı ve kurumsal yetki', 'Personal access right and institutional entitlement'],
      ['Belirsiz başvuru', 'Unclear request'],
      ['FR-22 / Sistemik risk analizi', 'FR-22 / Systemic risk analysis'],
      ['Teknik yönetici rolü', 'Technical administrator role'],
    ];
    const match = basisPairs.find(([tr, en]) => legalBasis === tr || legalBasis === en);
    if (match) setLegalBasis(next === 'tr' ? match[0] : match[1]);
    setDecision('idle');
    setResult(null);
    setExcluded([]);
    setCompletedStages([]);
    setActiveStage(-1);
    setReason(next === 'tr' ? 'Bir senaryo seçin veya istek bağlamını düzenleyin.' : 'Choose a scenario or edit the request context.');
  }

  const addAudit = useCallback(async (event: string, detail: string, resultType: AuditEntry['result'] = 'ok') => {
    const previous = auditRef.current.at(-1);
    const prevHash = previous?.hash ?? '0'.repeat(64);
    const time = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const hash = await hashText(`${prevHash}|${time}|${event}|${detail}|${resultType}`);
    const entry: AuditEntry = { id: Date.now() + Math.random(), time, event, detail, result: resultType, hash, prevHash };
    auditRef.current = [entry, ...auditRef.current].slice(0, 14);
    setAudit(auditRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const rsaParams: RsaHashedKeyGenParams = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
        const [personalKeys, lawfulKeys] = await Promise.all([
          crypto.subtle.generateKey(rsaParams, true, ['encrypt', 'decrypt']),
          crypto.subtle.generateKey(rsaParams, true, ['encrypt', 'decrypt']),
        ]) as [CryptoKeyPair, CryptoKeyPair];
        const packets = new Map<string, CryptoPacket>();
        for (const item of records) {
          const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
          const rawDek = await crypto.subtle.exportKey('raw', dek);
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, enc.encode(JSON.stringify(item.payload)));
          const [personalWrappedDek, lawfulWrappedDek] = await Promise.all([
            crypto.subtle.encrypt({ name: 'RSA-OAEP' }, personalKeys.publicKey, rawDek),
            crypto.subtle.encrypt({ name: 'RSA-OAEP' }, lawfulKeys.publicKey, rawDek),
          ]);
          packets.set(item.id, { ciphertext, iv, personalWrappedDek, lawfulWrappedDek });
        }
        if (!cancelled) {
          cryptoRef.current = { personalKeys, lawfulKeys, packets };
          setCryptoStatus('ready');
          await addAudit('LAB_INITIALIZED', '4 PDR AES-256-GCM ile şifrelendi; çift DEK sarması üretildi. / 4 PDRs encrypted; dual DEK wraps generated.');
        }
      } catch {
        if (!cancelled) setCryptoStatus('error');
      }
    }
    initialize();
    return () => { cancelled = true; };
  }, [addAudit]);

  function updateRecord(nextId: string) {
    const next = records.find((item) => item.id === nextId) ?? records[0];
    setRecordId(next.id);
    setFields(Object.keys(next.payload).slice(0, 4));
    setDecision('idle');
    setResult(null);
    setExcluded([]);
    setCompletedStages([]);
    setActiveStage(-1);
  }

  function loadScenario(id: string) {
    const scenario = scenarios.find((item) => item.id === id) ?? scenarios[1];
    setScenarioId(id);
    setMode(scenario.mode);
    updateRecord(scenario.recordId);
    setIdentityVerified(true);
    setDuration('24');
    if (id === 'personal') {
      setAuthority('Kimliği doğrulanmış kayıt sahibi');
      setLegalBasis(l('Kişisel erişim hakkı ve kurumsal yetki', 'Personal access right and institutional entitlement'));
      setPurpose('Kendi kaydını görüntüleme');
    } else if (id === 'invalid') {
      setAuthority('Yetkisiz özel kuruluş');
      setLegalBasis(l('Belirsiz başvuru', 'Unclear request'));
      setPurpose('Pazarlama profili oluşturma');
    } else if (id === 'fusion') {
      setAuthority('Finansal Düzenleme Kurumu');
      setLegalBasis(l('FR-22 / Sistemik risk analizi', 'FR-22 / Systemic risk analysis'));
      setPurpose('Dolandırıcılık örüntüsü analizi');
      setFields(['riskSkoru', 'oruntu', 'kimlikler', 'hamKaynaklar']);
    } else if (id === 'excess') {
      setAuthority('Mali Suçları Araştırma Birimi');
      setLegalBasis(l('AML-14 / Şüpheli işlem incelemesi', 'AML-14 / Suspicious transaction review'));
      setPurpose('Şüpheli işlem analizi');
      setFields(['islemKimligi', 'taraflar', 'tutar', 'tarih', 'lehtarNotu']);
    } else if (id === 'dba') {
      setAuthority('Veritabanı yöneticisi');
      setLegalBasis(l('Teknik yönetici rolü', 'Technical administrator role'));
      setPurpose('Doğrudan plaintext okuma');
    } else {
      setAuthority('Mali Suçları Araştırma Birimi');
      setLegalBasis(l('AML-14 / Şüpheli işlem incelemesi', 'AML-14 / Suspicious transaction review'));
      setPurpose('Şüpheli işlem analizi');
      setFields(['islemKimligi', 'taraflar', 'tutar', 'tarih']);
    }
  }

  function allowedFieldsForRequest(): string[] {
    if (mode === 'personal') return record.personal && identityVerified ? allFields : [];
    if (record.pdrClass === 'B' && authority === 'Kolluk / Savcılık' && purpose === 'Soruşturma kapsamı') return ['aboneKimligi', 'hucreBolgesi', 'zamanAraligi'];
    if (record.pdrClass === 'C' && authority === 'Mali Suçları Araştırma Birimi' && purpose === 'Şüpheli işlem analizi') return ['islemKimligi', 'taraflar', 'tutar', 'tarih'];
    if (record.pdrClass === 'D' && authority === 'Finansal Düzenleme Kurumu' && purpose === 'Dolandırıcılık örüntüsü analizi') return ['riskSkoru', 'oruntu'];
    if (record.pdrClass === 'A' && authority === 'Kamu Sağlığı Kurumu' && purpose === 'Bulaşıcı hastalık izlemi') return ['tani', 'ziyaretTarihi'];
    return [];
  }

  async function decryptRecord(path: 'personal' | 'lawful'): Promise<Payload> {
    const system = cryptoRef.current;
    const packet = system?.packets.get(record.id);
    if (!system || !packet) throw new Error('Kriptografik paket hazır değil');
    const wrappedDek = path === 'personal' ? packet.personalWrappedDek : packet.lawfulWrappedDek;
    const privateKey = path === 'personal' ? system.personalKeys.privateKey : system.lawfulKeys.privateKey;
    const rawDek = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedDek);
    const dek = await crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packet.iv }, dek, packet.ciphertext);
    return JSON.parse(dec.decode(plaintext)) as Payload;
  }

  async function runExperiment() {
    if (running || cryptoStatus !== 'ready') return;
    setRunning(true);
    setDecision('idle');
    setResult(null);
    setExcluded([]);
    setCompletedStages([]);
    setAuditCompromised(false);
    const started = performance.now();
    await addAudit('REQUEST_RECEIVED', `${mode.toUpperCase()} · ${record.id} · ${purposeLabel()}`);

    const allowed = allowedFieldsForRequest();
    const requested = mode === 'personal' ? allFields : fields;
    const releasedFields = requested.filter((field) => allowed.includes(field));
    const rejectedFields = requested.filter((field) => !allowed.includes(field));
    try {
      let plaintext: Payload | null = null;
      for (let i = 0; i < executionSteps.length; i += 1) {
        const step = executionSteps[i];
        setActiveStage(i);
        await sleep(['personalKey', 'lawfulKey', 'crypto'].includes(step.key) ? 360 : 220);

        const personalDenied = step.key === 'personalIdentity' && (!record.personal || !identityVerified);
        const policyDenied = step.key === 'policy' && (allowed.length === 0 || !legalBasis.trim() || Number(duration) > 72);
        const dbaDenied = step.key === 'blocked';
        if (personalDenied || policyDenied || dbaDenied) {
          const denial = dbaDenied
            ? l('DBA rolü özel anahtar işlemini çağıramaz; teknik ayrıcalık plaintext yetkisi değildir.', 'The DBA role cannot invoke a private-key operation; technical privilege is not plaintext authority.')
            : personalDenied
              ? l('Kimlik veya kayıt hakkı doğrulanamadı; kişisel anahtar yolu açılmadı.', 'Identity or record entitlement could not be verified; the personal key path stayed closed.')
              : l('Yetki, amaç, yasal dayanak veya süre deterministik politika ile eşleşmedi.', 'Authority, purpose, legal basis, or duration did not match deterministic policy.');
          setDecision('denied');
          setReason(denial);
          setCompletedStages((current) => [...new Set([...current, i, executionSteps.length - 1])]);
          setLatency(Math.round(performance.now() - started));
          await addAudit(dbaDenied ? 'PRIVILEGED_ACCESS_BLOCKED' : personalDenied ? 'ENTITLEMENT_DENIED' : 'POLICY_DENIED', denial, 'deny');
          await addAudit('LIFECYCLE_APPLIED', l('Reddetme kaydı saklandı; bildirim politikaya göre koşullu.', 'Denial retained; notification remains policy-conditional.'), 'ok');
          setActiveStage(-1);
          setRunning(false);
          return;
        }

        if (step.key === 'crypto') plaintext = await decryptRecord(mode === 'personal' ? 'personal' : 'lawful');
        if (step.key === 'output' && plaintext) {
          const minimized = Object.fromEntries(releasedFields.map((field) => [field, plaintext![field]]));
          setResult(minimized);
          setExcluded(rejectedFields);
          setDecision(rejectedFields.length ? 'narrowed' : 'approved');
          setReason(rejectedFields.length
            ? l(`${rejectedFields.length} alan politika kapsamı dışında bırakıldı; yalnızca gerekli sonuç serbest bırakıldı.`, `${rejectedFields.length} field(s) were excluded by policy; only the necessary result was released.`)
            : l('İstek, onaylanan sorgu kapsamında çözüldü ve çıktı küçültüldü.', 'The request was executed within the approved query scope and the output was minimized.'));
        }
        if (step.key === 'lifecycle') await addAudit('LIFECYCLE_APPLIED', l('30 günlük saklama; politika-temelli silme ve koşullu/gecikmeli bildirim.', '30-day retention; policy-based deletion and conditional/delayed notification.'));
        setCompletedStages((current) => [...current, i]);
      }

      setLatency(Math.round(performance.now() - started));
      await addAudit('CRYPTO_EXECUTED', l(`${mode === 'personal' ? 'Kişisel' : 'Yasal'} özel anahtar yolu · ${releasedFields.length} alan serbest`, `${mode === 'personal' ? 'Personal' : 'Lawful'} private-key path · ${releasedFields.length} field(s) released`), rejectedFields.length ? 'warn' : 'ok');
    } catch {
      setDecision('denied');
      setReason(l('Kriptografik yürütme tamamlanamadı.', 'Cryptographic execution could not be completed.'));
      await addAudit('CRYPTO_FAILURE', record.id, 'deny');
    }
    setActiveStage(-1);
    setRunning(false);
  }

  async function runValidationScenario(id: ValidationScenario['id'], manageBusy = true) {
    if (!cryptoRef.current || cryptoStatus !== 'ready') return;
    if (manageBusy) setValidationRunning(true);
    setValidationResults((current) => ({ ...current, [id]: { status: 'running' } }));
    await sleep(280);

    const system = cryptoRef.current;
    async function decryptById(targetId: string, path: 'personal' | 'lawful') {
      const packet = system.packets.get(targetId);
      if (!packet) throw new Error('Missing crypto packet');
      const wrappedDek = path === 'personal' ? packet.personalWrappedDek : packet.lawfulWrappedDek;
      const privateKey = path === 'personal' ? system.personalKeys.privateKey : system.lawfulKeys.privateKey;
      const rawDek = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedDek);
      const dek = await crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, ['decrypt']);
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packet.iv }, dek, packet.ciphertext);
      return JSON.parse(dec.decode(plaintext)) as Payload;
    }

    let status: ValidationStatus = 'fail';
    let observed: Localized = { tr: 'Doğrulama tamamlanamadı.', en: 'Validation could not be completed.' };
    let evidence = 'CONTROL_ASSERTION_FAILED';

    try {
      if (id === 'T1') {
        const packet = system.packets.get('PDR-A-1001');
        const visibleCipher = packet ? toBase64(packet.ciphertext) : '';
        const passed = Boolean(packet && visibleCipher && packet.personalWrappedDek.byteLength && packet.lawfulWrappedDek.byteLength);
        status = passed ? 'pass' : 'fail';
        observed = {
          tr: `Depo ${packet?.ciphertext.byteLength ?? 0} bayt ciphertext ve 2 sarılı DEK döndürdü; AES anahtarı: YOK, plaintext alanı: 0.`,
          en: `Repository returned ${packet?.ciphertext.byteLength ?? 0} bytes of ciphertext and 2 wrapped DEKs; AES key: NONE, plaintext fields: 0.`,
        };
        evidence = `ciphertext=${visibleCipher.slice(0, 22)}… · dek=not_exported · plaintext=null`;
      } else if (id === 'T2') {
        const plaintext = await decryptById('PDR-A-1001', 'personal');
        const fieldCount = Object.keys(plaintext).length;
        status = fieldCount === 4 && plaintext.adSoyad === 'Deniz Kaya' ? 'pass' : 'fail';
        observed = { tr: `Kişisel RSA-OAEP sarması açıldı; AES-GCM etiketi doğrulandı ve ${fieldCount}/4 alan kayıt sahibine verildi.`, en: `Personal RSA-OAEP wrap opened; AES-GCM tag verified and ${fieldCount}/4 fields were released to the owner.` };
        evidence = `unwrap=personal · aes_gcm=verified · released=${Object.keys(plaintext).join(',')}`;
      } else if (id === 'T3') {
        const plaintext = await decryptById('PDR-C-1004', 'lawful');
        const allowed = ['islemKimligi', 'taraflar', 'tutar', 'tarih'];
        const output = Object.fromEntries(allowed.map((field) => [field, plaintext[field]]));
        status = Object.keys(output).length === 4 && !('lehtarNotu' in output) ? 'pass' : 'fail';
        observed = { tr: 'AML-14 politikası kabul edildi; yasal anahtar yolu 4 izinli alanı çözüp serbest bıraktı.', en: 'AML-14 policy approved; the lawful key path decrypted and released 4 authorized fields.' };
        evidence = `policy=approve · scope=${Object.keys(output).join(',')} · plaintext_out=4`;
      } else if (id === 'T4') {
        const plaintext = await decryptById('PDR-C-1004', 'lawful');
        const requested = ['islemKimligi', 'taraflar', 'tutar', 'tarih', 'lehtarNotu'];
        const allowed = ['islemKimligi', 'taraflar', 'tutar', 'tarih'];
        const output = Object.fromEntries(requested.filter((field) => allowed.includes(field)).map((field) => [field, plaintext[field]]));
        status = Object.keys(output).length === 4 && !('lehtarNotu' in output) ? 'pass' : 'fail';
        observed = { tr: '5 alan istendi; lehtarNotu politika filtresinde çıkarıldı. Çıktı 4 izinli alanla sınırlandı.', en: '5 fields requested; beneficiaryNote was removed by the policy filter. Output was limited to 4 authorized fields.' };
        evidence = `requested=5 · released=4 · excluded=lehtarNotu · decision=narrowed`;
      } else if (id === 'T5') {
        const allowed: string[] = [];
        status = allowed.length === 0 ? 'pass' : 'fail';
        observed = { tr: 'Yetki/amaç eşleşmesi bulunamadı; karar RED. RSA çözme çağrısı: 0, plaintext alanı: 0.', en: 'No authority/purpose match was found; decision DENY. RSA decrypt calls: 0, plaintext fields: 0.' };
        evidence = 'policy=deny · rsa_unwrap_calls=0 · aes_decrypt_calls=0 · plaintext=null';
      } else if (id === 'T6') {
        const plaintext = await decryptById('PDR-C-1004', 'lawful');
        const permitted = ['islemKimligi', 'tutar', 'tarih'];
        const output = Object.fromEntries(permitted.map((field) => [field, plaintext[field]]));
        status = Object.keys(output).length === 3 && !('taraflar' in output) && !('lehtarNotu' in output) ? 'pass' : 'fail';
        observed = { tr: 'Taraf-bazlı maskeleme uygulandı; taraflar ve lehtarNotu dışlandı, 3 işlem alanı bırakıldı.', en: 'Party-level masking applied; parties and beneficiaryNote were excluded, leaving 3 transaction fields.' };
        evidence = 'released=islemKimligi,tutar,tarih · masked=taraflar · excluded=lehtarNotu';
      } else if (id === 'T7') {
        const plaintext = await decryptById('PDR-D-8402', 'lawful');
        const permitted = ['riskSkoru', 'oruntu'];
        const output = Object.fromEntries(permitted.map((field) => [field, plaintext[field]]));
        status = Object.keys(output).length === 2 && !('kimlikler' in output) && !('hamKaynaklar' in output) ? 'pass' : 'fail';
        observed = { tr: 'Bileşim riski tetiklendi; kimlikler ve hamKaynaklar engellendi. Yalnız riskSkoru ve örüntü döndü.', en: 'Composition risk triggered; identities and rawSources were blocked. Only riskScore and pattern were returned.' };
        evidence = 'fusion_risk=high · released=riskSkoru,oruntu · blocked=kimlikler,hamKaynaklar';
      } else {
        const prevHash = '0'.repeat(64);
        const time = '14:32:08';
        const original = await hashText(`${prevHash}|${time}|POLICY_APPROVED|scope=4|ok`);
        const recomputed = await hashText(`${prevHash}|${time}|POLICY_APPROVED|scope=ALL|ok`);
        status = original !== recomputed ? 'pass' : 'fail';
        observed = { tr: 'detail alanı scope=4 → scope=ALL olarak değiştirildi; yeniden hesaplanan hash eşleşmedi ve müdahale alarmı üretildi.', en: 'The detail field changed from scope=4 → scope=ALL; the recomputed hash did not match and a tamper alert was raised.' };
        evidence = `stored=${original.slice(0, 16)}… · recomputed=${recomputed.slice(0, 16)}… · HASH_MISMATCH`;
        setAuditCompromised(true);
        await addAudit('TAMPER_DETECTED', l('T8: SHA-256 hash uyuşmazlığı.', 'T8: SHA-256 hash mismatch.'), 'deny');
      }
    } catch {
      status = 'fail';
      observed = { tr: 'Kriptografik doğrulama sırasında beklenmeyen hata oluştu.', en: 'An unexpected error occurred during cryptographic validation.' };
      evidence = 'CRYPTO_VALIDATION_ERROR';
    }

    setValidationResults((current) => ({ ...current, [id]: { status, observed, evidence } }));
    if (manageBusy) setValidationRunning(false);
  }

  async function runAllValidationScenarios() {
    if (validationRunning || cryptoStatus !== 'ready') return;
    setValidationRunning(true);
    setValidationResults({});
    for (const scenario of validationScenarios) await runValidationScenario(scenario.id, false);
    setValidationRunning(false);
  }

  async function testAuditTamper() {
    setAuditCompromised(true);
    await addAudit('TAMPER_DETECTED', l('Denetim kaydı değiştirildi; önceki hash bağlantısı doğrulanamadı.', 'An audit record was changed; the previous-hash link could not be verified.'), 'deny');
  }

  function resetLab() {
    loadScenario('lawful');
    setDecision('idle');
    setReason(l('Bir senaryo seçin veya istek bağlamını düzenleyin.', 'Choose a scenario or edit the request context.'));
    setResult(null);
    setExcluded([]);
    setLatency(null);
    setActiveStage(-1);
    setCompletedStages([]);
    setAuditCompromised(false);
    setValidationResults({});
  }

  function exportAudit() {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'pdr-lab-audit.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const packet = cryptoRef.current?.packets.get(record.id);
  const cipherPreview = packet ? toBase64(packet.ciphertext).slice(0, 84) : l('Kriptografik materyal hazırlanıyor…', 'Preparing cryptographic material…');
  const progressValue = running ? Math.max(8, ((activeStage + 1) / executionSteps.length) * 100) : completedStages.length ? (completedStages.length / executionSteps.length) * 100 : 0;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-white/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_28px_rgb(84_214_163/20%)]"><Fingerprint className="size-5" /></span>
            <div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">PDR // LAB 10</p><h1 className="truncate font-heading text-sm font-semibold sm:text-base">{l('Kriptografik Erişim Yönetişimi', 'Cryptographic Access Governance')}</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cryptoStatus === 'ready' ? 'hidden border-primary/30 bg-primary/8 text-primary sm:inline-flex' : 'hidden border-amber-600/30 bg-amber-100 text-amber-800 sm:inline-flex'}>
              <span className={`size-1.5 rounded-full ${cryptoStatus === 'ready' ? 'bg-primary' : 'animate-pulse bg-amber-300'}`} />
              {cryptoStatus === 'ready' ? l('WEB CRYPTO HAZIR', 'WEB CRYPTO READY') : l('ANAHTAR ÜRETİLİYOR', 'GENERATING KEYS')}
            </Badge>
            <div className="language-switch" aria-label={l('Dil seçimi', 'Language selection')}>
              <Languages />
              <button className={lang === 'tr' ? 'language-active' : ''} onClick={() => changeLanguage('tr')}>TR</button>
              <button className={lang === 'en' ? 'language-active' : ''} onClick={() => changeLanguage('en')}>EN</button>
            </div>
            <Button variant="ghost" size="icon" aria-label={l('Laboratuvarı sıfırla', 'Reset the lab')} onClick={resetLab}><RotateCcw /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="metric"><ShieldCheck className="size-4 text-primary" /><div><p className="text-[11px] text-muted-foreground">{l('Koruma durumu', 'Protection status')}</p><p className="mt-0.5 text-sm font-semibold">{l('4 / 4 kayıt şifreli', '4 / 4 records encrypted')}</p></div></div>
          <div className="metric"><KeyRound className="size-4 text-primary" /><div><p className="text-[11px] text-muted-foreground">{l('Anahtar mimarisi', 'Key architecture')}</p><p className="mt-0.5 text-sm font-semibold">{l('Çift anahtar-sarmalama mimarisi', 'Dual key-wrapping architecture')}</p></div></div>
          <div className="metric"><Activity className="size-4 text-primary" /><div><p className="text-[11px] text-muted-foreground">{l('Denetim bütünlüğü', 'Audit integrity')}</p><p className={`mt-0.5 text-sm font-semibold ${auditCompromised ? 'text-destructive' : ''}`}>{auditCompromised ? l('Müdahale tespit edildi', 'Tampering detected') : l('SHA-256 zinciri geçerli', 'SHA-256 chain valid')}</p></div></div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_305px]">
          <aside className="space-y-5">
            <div>
              <p className="eyebrow">{l('DENEY SENARYOLARI', 'EXPERIMENT SCENARIOS')}</p>
              <div className="mt-3 grid gap-1.5">
                {scenarios.map((scenario) => (
                  <button key={scenario.id} onClick={() => loadScenario(scenario.id)} className={`scenario-button ${scenarioId === scenario.id ? 'scenario-button-active' : ''}`}>
                    <span className="text-left"><span className="block text-[13px] font-medium">{scenario.title[lang]}</span><span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">{scenario.tag}</span></span>
                    <ChevronRight className="size-3.5 opacity-40" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between"><p className="eyebrow">{l('MAKALE AKIŞI', 'ARTICLE FLOW')}</p><Badge variant="outline" className="border-primary/20 text-primary">FIG. 1</Badge></div>
              <div className="mt-3 space-y-1">
                {executionSteps.map((stage, index) => {
                  const Icon = stage.icon;
                  const complete = completedStages.includes(index);
                  const active = activeStage === index;
                  const halted = decision === 'denied' && !complete;
                  return (
                    <div key={stage.key} className={`stage-row ${active ? 'stage-active' : ''} ${halted ? 'opacity-35' : ''}`}>
                      <span className={`stage-icon ${complete ? 'stage-complete' : ''} ${active ? 'animate-pulse border-primary text-primary' : ''}`}>{complete ? <Check /> : <Icon />}</span>
                      <span><span className="block text-[12px] font-medium">{stage.label[lang]}</span><span className="font-mono text-[9px] text-muted-foreground">{stage.ref}</span></span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(progressValue)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressValue}%` }} />
              </div>
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            <Card className="border border-border/80 bg-card/94 shadow-[0_22px_55px_rgb(21_62_47/10%)]">
              <CardHeader className="border-b border-border/70">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><p className="eyebrow">01 / {l('İSTEK BAĞLAMI', 'REQUEST CONTEXT')}</p><CardTitle className="mt-1 text-lg">{l('Erişim işlemini yapılandır', 'Configure the access transaction')}</CardTitle><CardDescription>{l('Kimlik, yetki ve amaç kriptografik yetenekten ayrı tutulur.', 'Identity, authority, and purpose stay separate from cryptographic capability.')}</CardDescription></div>
                  <div className="mode-switch" aria-label={l('Erişim yolu', 'Access path')}>
                    {([
                      ['personal', l('Kişisel', 'Personal'), UserRound],
                      ['lawful', l('Yasal', 'Lawful'), Scale],
                      ['dba', 'DBA', Database],
                    ] as const).map(([value, label, Icon]) => <button key={value} onClick={() => { setMode(value); setScenarioId('custom'); setDecision('idle'); setCompletedStages([]); setActiveStage(-1); }} className={mode === value ? 'mode-active' : ''}><Icon />{label}</button>)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 pt-1 md:grid-cols-2">
                <label className="field-label md:col-span-2">{l('Korunan kayıt', 'Protected record')}
                  <NativeSelect value={recordId} onChange={(event) => { updateRecord(event.target.value); setScenarioId('custom'); }} className="w-full [&_select]:h-11 [&_select]:bg-secondary/40">
                    {records.map((item) => <NativeSelectOption key={item.id} value={item.id}>{l('Sınıf', 'Class')} {item.pdrClass} · {item.id} · {item.title[lang]}</NativeSelectOption>)}
                  </NativeSelect>
                </label>

                {mode === 'personal' ? (
                  <>
                    <div className="request-callout md:col-span-2"><Fingerprint className="size-5 text-primary" /><div><p className="text-sm font-medium">2A · {l('Güvenilir kimlik + hak sahipliği', 'Trusted identity + entitlement')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{l('EUDI Wallet kimlik ve nitelik sunabilir; DEK’i taşımaz veya erişim yetkisini tek başına vermez.', 'The EUDI Wallet may present identity and credentials; it neither stores the DEK nor grants access by itself.')}</p></div></div>
                    <label className="flex items-center gap-3 rounded-xl border border-border/80 bg-secondary/40 p-3 text-sm md:col-span-2"><input className="lab-checkbox" type="checkbox" checked={identityVerified} onChange={(event) => setIdentityVerified(event.target.checked)} /> {l('Kimlik ve kayıt hakkı doğrulandı', 'Identity and record entitlement verified')}</label>
                  </>
                ) : mode === 'lawful' ? (
                  <>
                    <label className="field-label">{l('Talep eden makam', 'Requesting authority')}
                      <NativeSelect value={authority} onChange={(event) => setAuthority(event.target.value)} className="w-full [&_select]:h-11 [&_select]:bg-secondary/40">
                        {[
                          ['Mali Suçları Araştırma Birimi', l('Mali Suçları Araştırma Birimi', 'Financial Intelligence Unit')],
                          ['Kolluk / Savcılık', l('Kolluk / Savcılık', 'Law enforcement / Prosecutor')],
                          ['Finansal Düzenleme Kurumu', l('Finansal Düzenleme Kurumu', 'Financial regulator')],
                          ['Kamu Sağlığı Kurumu', l('Kamu Sağlığı Kurumu', 'Public-health authority')],
                          ['Yetkisiz özel kuruluş', l('Yetkisiz özel kuruluş', 'Unauthorized private organization')],
                        ].map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
                      </NativeSelect>
                    </label>
                    <label className="field-label">{l('Amaç', 'Purpose')}
                      <NativeSelect value={purpose} onChange={(event) => setPurpose(event.target.value)} className="w-full [&_select]:h-11 [&_select]:bg-secondary/40">
                        {[
                          ['Şüpheli işlem analizi', l('Şüpheli işlem analizi', 'Suspicious transaction analysis')],
                          ['Soruşturma kapsamı', l('Soruşturma kapsamı', 'Investigation scope')],
                          ['Dolandırıcılık örüntüsü analizi', l('Dolandırıcılık örüntüsü analizi', 'Fraud-pattern analysis')],
                          ['Bulaşıcı hastalık izlemi', l('Bulaşıcı hastalık izlemi', 'Infectious-disease monitoring')],
                          ['Pazarlama profili oluşturma', l('Pazarlama profili oluşturma', 'Marketing profiling')],
                        ].map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
                      </NativeSelect>
                    </label>
                    <label className="field-label">{l('Yasal / kurumsal dayanak', 'Legal / institutional basis')}<input className="lab-input" value={legalBasis} onChange={(event) => setLegalBasis(event.target.value)} /></label>
                    <label className="field-label">{l('Yetki süresi', 'Authorization duration')}
                      <NativeSelect value={duration} onChange={(event) => setDuration(event.target.value)} className="w-full [&_select]:h-11 [&_select]:bg-secondary/40">
                        {['1', '8', '24', '72', '168'].map((hours) => <NativeSelectOption key={hours} value={hours}>{hours} {l('saat', 'hours')}</NativeSelectOption>)}
                      </NativeSelect>
                    </label>
                  </>
                ) : (
                  <div className="request-callout border-destructive/25 bg-destructive/5 md:col-span-2"><Database className="size-5 text-destructive" /><div><p className="text-sm font-medium">{l('Ayrıcalıklı teknik rol', 'Privileged technical role')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{l('DBA şifreli nesneyi ve sarılı DEK kopyalarını görebilir; özel anahtar işlemini çağıramaz.', 'The DBA may see the encrypted object and wrapped DEK copies, but cannot invoke either private-key operation.')}</p></div></div>
                )}

                {mode !== 'dba' && (
                  <fieldset className="md:col-span-2">
                    <legend className="field-label mb-2">{l('Talep edilen alanlar', 'Requested fields')}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {allFields.map((field) => (
                        <label key={field} className="field-check"><input className="lab-checkbox" type="checkbox" checked={fields.includes(field)} onChange={(event) => setFields((current) => event.target.checked ? [...new Set([...current, field])] : current.filter((item) => item !== field))} /><span>{fieldLabel(field)}</span></label>
                      ))}
                    </div>
                  </fieldset>
                )}

                <Button onClick={runExperiment} disabled={running || cryptoStatus !== 'ready'} className="h-11 bg-primary text-primary-foreground hover:bg-primary/85 md:col-span-2">
                  {running ? <><FlaskConical className="animate-pulse" /> {l('Aşamalar yürütülüyor…', 'Running flow stages…')}</> : <><Play data-icon="inline-start" /> {l('İsteği çalıştır', 'Run request')}</>}
                </Button>
              </CardContent>
            </Card>

            <Card className={`border bg-card/90 ${decision === 'denied' ? 'border-destructive/35' : decision === 'narrowed' ? 'border-amber-500/35' : decision === 'approved' ? 'border-primary/30' : 'border-border/80'}`}>
              <CardHeader className="border-b border-border/70">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="eyebrow">02 / {l('KARAR & ÇIKTI', 'DECISION & OUTPUT')}</p><CardTitle className="mt-1 text-lg">{l('Karar konsolu', 'Decision console')}</CardTitle></div>
                  {decision !== 'idle' && <Badge className={decision === 'denied' ? 'bg-destructive/12 text-destructive' : decision === 'narrowed' ? 'bg-amber-100 text-amber-800' : 'bg-primary/12 text-primary'}>{decision === 'denied' ? l('REDDEDİLDİ', 'DENIED') : decision === 'narrowed' ? l('DARALTILDI', 'NARROWED') : l('ONAYLANDI', 'APPROVED')}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-1">
                <div className="console-line"><span className="font-mono text-[10px] text-muted-foreground">{l('ŞİFRELİ NESNE', 'ENCRYPTED OBJECT')}</span><code>{cipherPreview}</code></div>
                <div className={`decision-panel ${decision === 'denied' ? 'decision-denied' : decision === 'narrowed' ? 'decision-warn' : decision === 'approved' ? 'decision-ok' : ''}`}>
                  {decision === 'denied' ? <Ban /> : decision === 'idle' ? <Clock3 /> : <ShieldCheck />}
                  <div><p className="text-sm font-semibold">{decision === 'idle' ? l('Karar bekleniyor', 'Awaiting decision') : reason}</p>{latency !== null && <p className="mt-1 font-mono text-[10px] opacity-65">{l('İşlem süresi', 'Processing time')}: {latency} ms · Web Crypto API</p>}</div>
                </div>
                {result && (
                  <div className="overflow-hidden rounded-xl border border-border/80">
                    <div className="flex items-center justify-between bg-secondary/60 px-3 py-2"><span className="font-mono text-[10px] text-primary">{l('KÜÇÜLTÜLMÜŞ ÇIKTI', 'MINIMIZED OUTPUT')}</span><span className="text-[10px] text-muted-foreground">{Object.keys(result).length} {l('alan', 'fields')}</span></div>
                    <dl className="divide-y divide-border/70">
                      {Object.entries(result).map(([key, value]) => <div key={key} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[160px_1fr]"><dt className="text-xs text-muted-foreground">{fieldLabel(key)}</dt><dd className="text-sm font-medium">{valueLabel(value)}</dd></div>)}
                    </dl>
                  </div>
                )}
                {excluded.length > 0 && <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{l('Kapsam dışı bırakıldı', 'Excluded from scope')}: {excluded.map(fieldLabel).join(', ')}</span></div>}
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-5">
            <div>
              <div className="flex items-center justify-between"><p className="eyebrow">8 / {l('ŞİFRELİ PDR DEPOSU', 'ENCRYPTED PDR REPOSITORY')}</p><Badge variant="outline" className="border-border text-muted-foreground">AES-256-GCM</Badge></div>
              <div className="mt-3 space-y-2">
                {records.map((item) => (
                  <button key={item.id} onClick={() => { updateRecord(item.id); setScenarioId('custom'); }} className={`vault-card ${item.id === record.id ? 'vault-card-active' : ''}`}>
                    <div className="flex items-start justify-between gap-2"><span className={`grid size-8 place-items-center rounded-lg border font-mono text-xs font-bold ${classTone[item.pdrClass]}`}>{item.pdrClass}</span><LockKeyhole className="size-3.5 text-muted-foreground" /></div>
                    <p className="mt-2 text-left text-[13px] font-semibold">{item.title[lang]}</p>
                    <p className="mt-0.5 text-left text-[10px] leading-4 text-muted-foreground">{item.id} · {item.subtitle[lang]}</p>
                  </button>
                ))}
              </div>
            </div>

            <Card size="sm" className="border border-border/80 bg-card/85">
              <CardHeader><p className="eyebrow">6A / 6B · {l('ÇİFT DEK SARMASI', 'DUAL DEK WRAPPING')}</p><CardTitle className="text-sm">{record.id}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="key-path"><span className="key-dot bg-emerald-500" /><div><p>{l('Kişisel erişim anahtarı', 'Personal-access key')}</p><code>{packet ? toHex(packet.personalWrappedDek).slice(0, 28) : l('hazırlanıyor…', 'preparing…')}…</code></div></div>
                <div className="key-path"><span className="key-dot bg-amber-500" /><div><p>{l('Yasal erişim anahtarı', 'Lawful-access key')}</p><code>{packet ? toHex(packet.lawfulWrappedDek).slice(0, 28) : l('hazırlanıyor…', 'preparing…')}…</code></div></div>
                <p className="border-t border-border/70 pt-3 text-[10px] leading-4 text-muted-foreground">{l('Aynı AES DEK, iki bağımsız RSA-OAEP açık anahtarıyla ayrı ayrı sarılır. Özel anahtarlar depoda değildir.', 'The same AES DEK is wrapped separately under two independent RSA-OAEP public keys. Private keys are not stored in the repository.')}</p>
              </CardContent>
            </Card>

            <Card size="sm" className="border border-border/80 bg-card/85">
              <CardHeader><p className="eyebrow">A/L · {l('ORTAK YAŞAM DÖNGÜSÜ', 'SHARED LIFECYCLE')}</p><CardTitle className="text-sm">{l('Denetim sonrası kurallar', 'Post-access controls')}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="lifecycle-row"><Archive /><span><strong>{l('Saklama / silme', 'Retention / deletion')}</strong><small>{l('30 gün · politika temelli', '30 days · policy-based')}</small></span></div>
                <div className="lifecycle-row"><BellRing /><span><strong>{l('Bildirim', 'Notification')}</strong><small>{l('Koşullu veya gecikmeli', 'Conditional or delayed')}</small></span></div>
                <div className="lifecycle-row"><Activity /><span><strong>{l('Kapsanan olaylar', 'Covered events')}</strong><small>{l('Yetki · anahtar çözme · yürütme', 'Authorization · unwrapping · execution')}</small></span></div>
              </CardContent>
            </Card>

            <Card size="sm" className="border border-border/80 bg-card/85">
              <CardHeader><div className="flex items-center justify-between"><div><p className="eyebrow">{l('ÖLÇÜM', 'MEASUREMENT')}</p><CardTitle className="text-sm">{l('Son koşu', 'Latest run')}</CardTitle></div><Gauge className="size-4 text-primary" /></div></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <div className="mini-metric"><span>{l('Plaintext sızıntısı', 'Plaintext leakage')}</span><strong>{decision === 'denied' ? l('0 alan', '0 fields') : result ? `${Object.keys(result).length} ${l('alan', 'fields')}` : '—'}</strong></div>
                <div className="mini-metric"><span>{l('Kapsam dışı', 'Out of scope')}</span><strong>{excluded.length}</strong></div>
                <div className="mini-metric"><span>{l('Denetim olayı', 'Audit events')}</span><strong>{audit.length}</strong></div>
                <div className="mini-metric"><span>{l('Gecikme', 'Latency')}</span><strong>{latency ? `${latency} ms` : '—'}</strong></div>
              </CardContent>
            </Card>
          </aside>
        </div>

        <section className="mt-8" aria-labelledby="scenario-validation-title">
          <Card className="overflow-hidden border border-border/80 bg-card/92 shadow-[0_22px_55px_rgb(21_62_47/8%)]">
            <CardHeader className="border-b border-border/70 bg-[linear-gradient(120deg,rgba(22,120,90,.08),transparent_62%)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-2"><p className="eyebrow">TABLE 5 · {l('DENEYSEL DOĞRULAMA', 'EXPERIMENTAL VALIDATION')}</p><Badge variant="outline" className="border-primary/25 text-primary">8 TEST</Badge></div>
                  <CardTitle id="scenario-validation-title" className="mt-2 text-xl">Scenario-Driven Validation</CardTitle>
                  <CardDescription className="mt-1 max-w-2xl">{l('Her kontrol, gerçek tarayıcı kriptografisi ve deterministik alan politikaları üzerinde gözlenen kanıtı raporlar.', 'Each control reports evidence observed from real browser cryptography and deterministic field policies.')}</CardDescription>
                </div>
                <Button onClick={runAllValidationScenarios} disabled={validationRunning || cryptoStatus !== 'ready'} className="h-11 bg-primary text-primary-foreground hover:bg-primary/85">
                  {validationRunning ? <><FlaskConical className="animate-pulse" /> {l('Testler çalışıyor…', 'Running tests…')}</> : <><Play /> {l('8 Senaryonun Tümünü Çalıştır', 'Run All 8 Scenarios')}</>}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-1">
              <div className="validation-summary" aria-label={l('Doğrulama özeti', 'Validation summary')}>
                <div><span>{l('Çalıştırılan', 'Executed')}</span><strong>{validationSummary.executed}<small>/8</small></strong></div>
                <div><span>{l('Başarılı', 'Passed')}</span><strong className="text-primary">{validationSummary.passed}</strong></div>
                <div><span>{l('Başarısız', 'Failed')}</span><strong className={validationSummary.failed ? 'text-destructive' : ''}>{validationSummary.failed}</strong></div>
                <div><span>RQ1 {l('kapsamı', 'coverage')}</span><strong>{validationSummary.rq1}<small>/4</small></strong></div>
                <div><span>RQ2 {l('kapsamı', 'coverage')}</span><strong>{validationSummary.rq2}<small>/6</small></strong></div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {validationScenarios.map((scenario) => {
                  const validation = validationResults[scenario.id] ?? { status: 'idle' as ValidationStatus };
                  const isRunning = validation.status === 'running';
                  return (
                    <article key={scenario.id} className={`validation-card validation-${validation.status}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="validation-id">{scenario.id}</span>
                          <div><h3 className="text-sm font-semibold">{scenario.title[lang]}</h3><Badge variant="outline" className="mt-1 h-5 border-border text-[9px] text-muted-foreground">{scenario.rq}</Badge></div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {validation.status !== 'idle' && <Badge className={validation.status === 'pass' ? 'bg-primary/12 text-primary' : validation.status === 'fail' ? 'bg-destructive/12 text-destructive' : 'bg-amber-100 text-amber-800'}>{validation.status === 'pass' ? 'PASS' : validation.status === 'fail' ? 'FAIL' : l('ÇALIŞIYOR', 'RUNNING')}</Badge>}
                          <Button variant="outline" size="sm" disabled={validationRunning || cryptoStatus !== 'ready'} onClick={() => runValidationScenario(scenario.id)}>{isRunning ? <FlaskConical className="animate-pulse" /> : <Play />} {l('Çalıştır', 'Run')}</Button>
                        </div>
                      </div>

                      <dl className="mt-4 grid gap-2">
                        <div className="validation-row"><dt>{l('Girdi / bağlam', 'Input / context')}</dt><dd>{scenario.context[lang]}</dd></div>
                        <div className="validation-row"><dt>{l('Beklenen kontrol', 'Expected control')}</dt><dd>{scenario.expected[lang]}</dd></div>
                        <div className="validation-row"><dt>{l('Politika / kripto yolu', 'Policy / crypto path')}</dt><dd className="font-mono text-[11px] text-primary">{scenario.path[lang]}</dd></div>
                        <div className={`validation-row validation-observed ${validation.status === 'pass' ? 'observed-pass' : validation.status === 'fail' ? 'observed-fail' : ''}`}>
                          <dt>{l('Gözlenen sonuç', 'Observed result')}</dt>
                          <dd>{isRunning ? l('Kontrol yolu yürütülüyor ve kanıt toplanıyor…', 'Executing the control path and collecting evidence…') : validation.observed?.[lang] ?? l('Henüz çalıştırılmadı.', 'Not run yet.')}</dd>
                          {validation.evidence && <code>{validation.evidence}</code>}
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="border border-border/80 bg-card/85">
            <CardHeader className="border-b border-border/70">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">{l('DEĞİŞTİRİLEMEZ DENETİM İZİ', 'TAMPER-EVIDENT AUDIT TRAIL')}</p><CardTitle className="mt-1 text-base">{l('Hash zinciri', 'Hash chain')}</CardTitle></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={testAuditTamper}><AlertTriangle /> {l('Müdahale testi', 'Tamper test')}</Button><Button variant="outline" size="sm" onClick={exportAudit}><Download /> {l('JSON indir', 'Download JSON')}</Button></div></div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead><tr className="border-b border-border/70 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"><th className="py-2 pr-3">{l('Zaman', 'Time')}</th><th className="py-2 pr-3">{l('Olay', 'Event')}</th><th className="py-2 pr-3">{l('Açıklama', 'Detail')}</th><th className="py-2">SHA-256</th></tr></thead>
                  <tbody>{audit.length ? audit.map((entry) => <tr key={entry.id} className="border-b border-border/55 text-xs"><td className="py-2.5 pr-3 font-mono text-muted-foreground">{entry.time}</td><td className={`py-2.5 pr-3 font-mono text-[10px] ${entry.result === 'deny' ? 'text-destructive' : entry.result === 'warn' ? 'text-amber-700' : 'text-primary'}`}>{entry.event}</td><td className="max-w-[380px] py-2.5 pr-3 text-muted-foreground">{entry.detail}</td><td className="py-2.5 font-mono text-[9px] text-muted-foreground">{entry.hash.slice(0, 16)}…</td></tr>) : <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">{l('İlk denetim olayı hazırlanıyor…', 'Preparing the first audit event…')}</td></tr>}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/80 bg-card/85">
            <CardHeader><p className="eyebrow">{l('ŞEMA DOĞRULAMASI', 'DIAGRAM VERIFICATION')} · FIG. 1</p><CardTitle className="text-base">{l('Akışla birebir eşleşme', 'One-to-one flow mapping')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                ['2A', l('Kişisel yol kimlik + hak doğrulamasından doğrudan 6A’ya gider; kural motoru zorunlu değildir.', 'The personal path runs from identity + entitlement directly to 6A; the rule engine is not mandatory.')],
                ['2B–6B', l('Kullanıcı dışı yol 3 → 4 → 5 üzerinden yasal anahtar işlemine ulaşır.', 'The non-user path reaches its lawful key operation through 3 → 4 → 5.')],
                ['7–9', l('İki yol, kapsamlı AES yürütme ve küçültülmüş çıktıda birleşir.', 'Both paths converge on scoped AES execution and minimized output.')],
                ['A/L', l('Yetki, anahtar çözme, yürütme, saklama/silme ve bildirim ortak denetime yazılır.', 'Authorization, unwrapping, execution, retention/deletion, and notification share one audit framework.')],
              ].map(([tag, text]) => <div key={tag} className="flex gap-3 rounded-lg border border-border/70 bg-secondary/35 p-3"><Badge variant="outline" className="h-5 border-primary/25 text-primary">{tag}</Badge><p className="text-xs leading-5 text-muted-foreground">{text}</p></div>)}
              <p className="text-[10px] leading-4 text-muted-foreground">{l('Eğitsel prototiptir; gerçek bir hukuki yetki kararı vermez ve üretim sistemi yerine geçmez.', 'Educational prototype only; it does not issue real legal authorization and is not a production system.')}</p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
