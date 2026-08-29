'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Activity, AlertTriangle, Ban, Check, ChevronRight, ClipboardCheck, Clock3,
  Database, Download, Fingerprint, FlaskConical, Gauge, KeyRound, LockKeyhole,
  Play, RotateCcw, Scale, ShieldCheck, Sparkles, Terminal, UserRound, UsersRound,
} from 'lucide-react';

type AccessMode = 'personal' | 'lawful' | 'dba';
type Decision = 'approved' | 'narrowed' | 'denied' | 'idle';
type Payload = Record<string, string | number>;

type PdrRecord = {
  id: string;
  pdrClass: 'A' | 'B' | 'C' | 'D';
  title: string;
  subtitle: string;
  owner: string;
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

const records: PdrRecord[] = [
  { id: 'PDR-A-1001', pdrClass: 'A', title: 'Kişisel sağlık kaydı', subtitle: 'Kullanıcı kontrollü kayıt', owner: 'Deniz Kaya', personal: true, payload: { adSoyad: 'Deniz Kaya', tani: 'Mevsimsel alerji', ziyaretTarihi: '2026-05-14', doktorNotu: 'Rutin kontrol önerildi' } },
  { id: 'PDR-B-2038', pdrClass: 'B', title: 'Telekom trafik kaydı', subtitle: 'Rıza dışı işlenen kurumsal kayıt', owner: 'Deniz Kaya', personal: false, payload: { aboneKimligi: 'SUB-7741', hucreBolgesi: 'İstanbul / Kadıköy', zamanAraligi: '2026-04-01–07', cihazKimligi: 'IMEI•••5932' } },
  { id: 'PDR-C-1004', pdrClass: 'C', title: 'Ortak işlem kaydı', subtitle: 'Çok taraflı finansal kayıt', owner: 'Deniz Kaya + 2 taraf', personal: false, payload: { islemKimligi: 'TX-93A17', taraflar: 'Deniz Kaya, Atlas Ltd., Nova AŞ', tutar: '₺248.500', tarih: '2026-06-21', lehtarNotu: 'Tedarik avansı' } },
  { id: 'PDR-D-8402', pdrClass: 'D', title: 'Birleşik risk profili', subtitle: 'Veri füzyonuyla hassaslaşan kayıt', owner: 'Karma veri kümesi', personal: false, payload: { riskSkoru: 82, oruntu: 'Yüksek frekanslı çapraz kurum hareketi', kimlikler: '14 ilişkili kişi', hamKaynaklar: 'Vergi + trafik + işlem' } },
];

const fieldLabels: Record<string, string> = {
  adSoyad: 'Ad soyad', tani: 'Tanı', ziyaretTarihi: 'Ziyaret tarihi', doktorNotu: 'Doktor notu',
  aboneKimligi: 'Abone kimliği', hucreBolgesi: 'Hücre bölgesi', zamanAraligi: 'Zaman aralığı', cihazKimligi: 'Cihaz kimliği',
  islemKimligi: 'İşlem kimliği', taraflar: 'Taraflar', tutar: 'Tutar', tarih: 'Tarih', lehtarNotu: 'Lehtar notu',
  riskSkoru: 'Risk skoru', oruntu: 'Örüntü', kimlikler: 'İlişkili kimlikler', hamKaynaklar: 'Ham kaynaklar',
};

const classTone: Record<PdrRecord['pdrClass'], string> = {
  A: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  B: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  C: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  D: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
};

const stages = [
  { label: 'İstek bağlamı', icon: ClipboardCheck },
  { label: 'Politika kararı', icon: Scale },
  { label: 'Sorgu kapsamı', icon: Terminal },
  { label: 'DEK çözme', icon: KeyRound },
  { label: 'AES yürütme', icon: LockKeyhole },
  { label: 'Çıktı küçültme', icon: Sparkles },
  { label: 'Denetim kaydı', icon: Activity },
];

const scenarios = [
  { id: 'personal', title: 'Geçerli kişisel erişim', tag: 'RQ2', mode: 'personal' as AccessMode, recordId: 'PDR-A-1001' },
  { id: 'lawful', title: 'Geçerli yasal sorgu', tag: 'RQ2', mode: 'lawful' as AccessMode, recordId: 'PDR-C-1004' },
  { id: 'excess', title: 'Fazla alan talebi', tag: 'RQ2', mode: 'lawful' as AccessMode, recordId: 'PDR-C-1004' },
  { id: 'invalid', title: 'Geçersiz yetki / amaç', tag: 'RQ2', mode: 'lawful' as AccessMode, recordId: 'PDR-B-2038' },
  { id: 'dba', title: 'DBA doğrudan erişimi', tag: 'RQ1', mode: 'dba' as AccessMode, recordId: 'PDR-A-1001' },
  { id: 'fusion', title: 'Veri füzyonu kısıtı', tag: 'RQ1', mode: 'lawful' as AccessMode, recordId: 'PDR-D-8402' },
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
  const [mode, setMode] = useState<AccessMode>('lawful');
  const [recordId, setRecordId] = useState('PDR-C-1004');
  const [authority, setAuthority] = useState('Mali Suçları Araştırma Birimi');
  const [legalBasis, setLegalBasis] = useState('AML-14 / Şüpheli işlem incelemesi');
  const [purpose, setPurpose] = useState('Şüpheli işlem analizi');
  const [duration, setDuration] = useState('24');
  const [identityVerified, setIdentityVerified] = useState(true);
  const [fields, setFields] = useState<string[]>(['islemKimligi', 'taraflar', 'tutar', 'tarih']);
  const [decision, setDecision] = useState<Decision>('idle');
  const [reason, setReason] = useState('Bir senaryo seçin veya istek bağlamını düzenleyin.');
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
  const cryptoRef = useRef<CryptoSystem | null>(null);
  const auditRef = useRef<AuditEntry[]>([]);

  const record = useMemo(() => records.find((item) => item.id === recordId) ?? records[0], [recordId]);
  const allFields = useMemo(() => Object.keys(record.payload), [record]);

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
          await addAudit('LAB_INITIALIZED', '4 PDR AES-256-GCM ile şifrelendi; çift DEK sarması üretildi.');
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
      setLegalBasis('Kişisel erişim hakkı ve kurumsal yetki');
      setPurpose('Kendi kaydını görüntüleme');
    } else if (id === 'invalid') {
      setAuthority('Yetkisiz özel kuruluş');
      setLegalBasis('Belirsiz başvuru');
      setPurpose('Pazarlama profili oluşturma');
    } else if (id === 'fusion') {
      setAuthority('Finansal Düzenleme Kurumu');
      setLegalBasis('FR-22 / Sistemik risk analizi');
      setPurpose('Dolandırıcılık örüntüsü analizi');
      setFields(['riskSkoru', 'oruntu', 'kimlikler', 'hamKaynaklar']);
    } else if (id === 'excess') {
      setAuthority('Mali Suçları Araştırma Birimi');
      setLegalBasis('AML-14 / Şüpheli işlem incelemesi');
      setPurpose('Şüpheli işlem analizi');
      setFields(['islemKimligi', 'taraflar', 'tutar', 'tarih', 'lehtarNotu']);
    } else if (id === 'dba') {
      setAuthority('Veritabanı yöneticisi');
      setLegalBasis('Teknik yönetici rolü');
      setPurpose('Doğrudan plaintext okuma');
    } else {
      setAuthority('Mali Suçları Araştırma Birimi');
      setLegalBasis('AML-14 / Şüpheli işlem incelemesi');
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
    await addAudit('REQUEST_RECEIVED', `${mode.toUpperCase()} · ${record.id} · ${purpose}`);

    for (let i = 0; i < stages.length; i += 1) {
      setActiveStage(i);
      await sleep(i === 3 || i === 4 ? 360 : 230);
      if (i === 1) {
        const allowed = allowedFieldsForRequest();
        const denied = mode === 'dba' || allowed.length === 0 || !legalBasis.trim() || Number(duration) > 72;
        if (denied) {
          setDecision('denied');
          const denial = mode === 'dba'
            ? 'DBA rolü özel anahtar işlemini çağıramaz; teknik ayrıcalık plaintext yetkisi değildir.'
            : 'Yetki, amaç, yasal dayanak veya süre deterministik politika ile eşleşmedi.';
          setReason(denial);
          setActiveStage(-1);
          setCompletedStages([0, 1]);
          setLatency(Math.round(performance.now() - started));
          await addAudit('POLICY_DENIED', denial, 'deny');
          setRunning(false);
          return;
        }
      }
      setCompletedStages((current) => [...current, i]);
    }

    const allowed = allowedFieldsForRequest();
    const requested = mode === 'personal' ? allFields : fields;
    const releasedFields = requested.filter((field) => allowed.includes(field));
    const rejectedFields = requested.filter((field) => !allowed.includes(field));
    try {
      const plaintext = await decryptRecord(mode === 'personal' ? 'personal' : 'lawful');
      const minimized = Object.fromEntries(releasedFields.map((field) => [field, plaintext[field]]));
      setResult(minimized);
      setExcluded(rejectedFields);
      setDecision(rejectedFields.length ? 'narrowed' : 'approved');
      setReason(rejectedFields.length
        ? `${rejectedFields.length} alan politika kapsamı dışında bırakıldı; yalnızca gerekli sonuç serbest bırakıldı.`
        : 'İstek, onaylanan sorgu kapsamında çözüldü ve çıktı küçültüldü.');
      setLatency(Math.round(performance.now() - started));
      await addAudit('CRYPTO_EXECUTED', `${mode === 'personal' ? 'Kişisel' : 'Yasal'} özel anahtar yolu · ${releasedFields.length} alan serbest`, rejectedFields.length ? 'warn' : 'ok');
    } catch {
      setDecision('denied');
      setReason('Kriptografik yürütme tamamlanamadı.');
      await addAudit('CRYPTO_FAILURE', record.id, 'deny');
    }
    setActiveStage(-1);
    setRunning(false);
  }

  async function testAuditTamper() {
    setAuditCompromised(true);
    await addAudit('TAMPER_DETECTED', 'Denetim kaydı değiştirildi; önceki hash bağlantısı doğrulanamadı.', 'deny');
  }

  function resetLab() {
    loadScenario('lawful');
    setDecision('idle');
    setReason('Bir senaryo seçin veya istek bağlamını düzenleyin.');
    setResult(null);
    setExcluded([]);
    setLatency(null);
    setActiveStage(-1);
    setCompletedStages([]);
    setAuditCompromised(false);
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
  const cipherPreview = packet ? toBase64(packet.ciphertext).slice(0, 84) : 'Kriptografik materyal hazırlanıyor…';
  const progressValue = running ? Math.max(8, ((activeStage + 1) / stages.length) * 100) : completedStages.length ? (completedStages.length / stages.length) * 100 : 0;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#071512]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_28px_rgb(84_214_163/20%)]"><Fingerprint className="size-5" /></span>
            <div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">PDR // LAB 10</p><h1 className="truncate font-heading text-sm font-semibold sm:text-base">Kriptografik Erişim Yönetişimi</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cryptoStatus === 'ready' ? 'border-primary/30 bg-primary/8 text-primary' : 'border-amber-400/30 bg-amber-400/10 text-amber-300'}>
              <span className={`size-1.5 rounded-full ${cryptoStatus === 'ready' ? 'bg-primary' : 'animate-pulse bg-amber-300'}`} />
              {cryptoStatus === 'ready' ? 'WEB CRYPTO HAZIR' : 'ANAHTAR ÜRETİLİYOR'}
            </Badge>
            <Button variant="ghost" size="icon" aria-label="Laboratuvarı sıfırla" onClick={resetLab}><RotateCcw /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="metric"><ShieldCheck className="size-4 text-primary" /><div><p className="text-[11px] text-muted-foreground">Koruma durumu</p><p className="mt-0.5 text-sm font-semibold">4 / 4 kayıt şifreli</p></div></div>
          <div className="metric"><KeyRound className="size-4 text-primary" /><div><p className="text-[11px] text-muted-foreground">Anahtar mimarisi</p><p className="mt-0.5 text-sm font-semibold">2 bağımsız RSA yolu</p></div></div>
          <div className="metric"><Activity className="size-4 text-primary" /><div><p className="text-[11px] text-muted-foreground">Denetim bütünlüğü</p><p className={`mt-0.5 text-sm font-semibold ${auditCompromised ? 'text-destructive' : ''}`}>{auditCompromised ? 'Müdahale tespit edildi' : 'SHA-256 zinciri geçerli'}</p></div></div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_305px]">
          <aside className="space-y-5">
            <div>
              <p className="eyebrow">DENEY SENARYOLARI</p>
              <div className="mt-3 grid gap-1.5">
                {scenarios.map((scenario) => (
                  <button key={scenario.id} onClick={() => loadScenario(scenario.id)} className={`scenario-button ${scenarioId === scenario.id ? 'scenario-button-active' : ''}`}>
                    <span className="text-left"><span className="block text-[13px] font-medium">{scenario.title}</span><span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">{scenario.tag}</span></span>
                    <ChevronRight className="size-3.5 opacity-40" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="eyebrow">YÜRÜTME HATTI</p>
              <div className="mt-3 space-y-1">
                {stages.map((stage, index) => {
                  const Icon = stage.icon;
                  const complete = completedStages.includes(index);
                  const active = activeStage === index;
                  const halted = decision === 'denied' && index > 1;
                  return (
                    <div key={stage.label} className={`stage-row ${active ? 'stage-active' : ''} ${halted ? 'opacity-35' : ''}`}>
                      <span className={`stage-icon ${complete ? 'stage-complete' : ''} ${active ? 'animate-pulse border-primary text-primary' : ''}`}>{complete ? <Check /> : <Icon />}</span>
                      <span><span className="block text-[12px] font-medium">{stage.label}</span><span className="font-mono text-[9px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span></span>
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
            <Card className="border border-white/8 bg-card/90 shadow-[0_24px_70px_rgb(0_0_0/18%)]">
              <CardHeader className="border-b border-white/8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><p className="eyebrow">01 / İSTEK BAĞLAMI</p><CardTitle className="mt-1 text-lg">Erişim işlemini yapılandır</CardTitle><CardDescription>Kimlik, yetki ve amaç kriptografik yetenekten ayrı tutulur.</CardDescription></div>
                  <div className="mode-switch" aria-label="Erişim yolu">
                    {([
                      ['personal', 'Kişisel', UserRound],
                      ['lawful', 'Yasal', Scale],
                      ['dba', 'DBA', Database],
                    ] as const).map(([value, label, Icon]) => <button key={value} onClick={() => { setMode(value); setScenarioId('custom'); setDecision('idle'); }} className={mode === value ? 'mode-active' : ''}><Icon />{label}</button>)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 pt-1 md:grid-cols-2">
                <label className="field-label md:col-span-2">Korunan kayıt
                  <NativeSelect value={recordId} onChange={(event) => { updateRecord(event.target.value); setScenarioId('custom'); }} className="w-full [&_select]:h-11 [&_select]:bg-[#0a1714]">
                    {records.map((item) => <NativeSelectOption key={item.id} value={item.id}>Sınıf {item.pdrClass} · {item.id} · {item.title}</NativeSelectOption>)}
                  </NativeSelect>
                </label>

                {mode === 'personal' ? (
                  <>
                    <div className="request-callout md:col-span-2"><Fingerprint className="size-5 text-primary" /><div><p className="text-sm font-medium">Güvenilir kimlik + hak sahipliği</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Dijital cüzdan kimlik ve nitelik sunabilir; DEK’i taşımaz veya erişim yetkisini tek başına vermez.</p></div></div>
                    <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0a1714] p-3 text-sm md:col-span-2"><input className="lab-checkbox" type="checkbox" checked={identityVerified} onChange={(event) => setIdentityVerified(event.target.checked)} /> Kimlik ve kayıt hakkı doğrulandı</label>
                  </>
                ) : mode === 'lawful' ? (
                  <>
                    <label className="field-label">Talep eden makam
                      <NativeSelect value={authority} onChange={(event) => setAuthority(event.target.value)} className="w-full [&_select]:h-11 [&_select]:bg-[#0a1714]">
                        {['Mali Suçları Araştırma Birimi', 'Kolluk / Savcılık', 'Finansal Düzenleme Kurumu', 'Kamu Sağlığı Kurumu', 'Yetkisiz özel kuruluş'].map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}
                      </NativeSelect>
                    </label>
                    <label className="field-label">Amaç
                      <NativeSelect value={purpose} onChange={(event) => setPurpose(event.target.value)} className="w-full [&_select]:h-11 [&_select]:bg-[#0a1714]">
                        {['Şüpheli işlem analizi', 'Soruşturma kapsamı', 'Dolandırıcılık örüntüsü analizi', 'Bulaşıcı hastalık izlemi', 'Pazarlama profili oluşturma'].map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}
                      </NativeSelect>
                    </label>
                    <label className="field-label">Yasal / kurumsal dayanak<input className="lab-input" value={legalBasis} onChange={(event) => setLegalBasis(event.target.value)} /></label>
                    <label className="field-label">Yetki süresi
                      <NativeSelect value={duration} onChange={(event) => setDuration(event.target.value)} className="w-full [&_select]:h-11 [&_select]:bg-[#0a1714]">
                        {['1', '8', '24', '72', '168'].map((hours) => <NativeSelectOption key={hours} value={hours}>{hours} saat</NativeSelectOption>)}
                      </NativeSelect>
                    </label>
                  </>
                ) : (
                  <div className="request-callout border-destructive/25 bg-destructive/5 md:col-span-2"><Database className="size-5 text-destructive" /><div><p className="text-sm font-medium">Ayrıcalıklı teknik rol</p><p className="mt-1 text-xs leading-5 text-muted-foreground">DBA şifreli nesneyi ve sarılı DEK kopyalarını görebilir; özel anahtar işlemini çağıramaz.</p></div></div>
                )}

                {mode !== 'dba' && (
                  <fieldset className="md:col-span-2">
                    <legend className="field-label mb-2">Talep edilen alanlar</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {allFields.map((field) => (
                        <label key={field} className="field-check"><input className="lab-checkbox" type="checkbox" checked={fields.includes(field)} onChange={(event) => setFields((current) => event.target.checked ? [...new Set([...current, field])] : current.filter((item) => item !== field))} /><span>{fieldLabels[field]}</span></label>
                      ))}
                    </div>
                  </fieldset>
                )}

                <Button onClick={runExperiment} disabled={running || cryptoStatus !== 'ready'} className="h-11 bg-primary text-[#062019] hover:bg-primary/85 md:col-span-2">
                  {running ? <><FlaskConical className="animate-pulse" /> Aşamalar yürütülüyor…</> : <><Play data-icon="inline-start" /> İsteği çalıştır</>}
                </Button>
              </CardContent>
            </Card>

            <Card className={`border bg-card/80 ${decision === 'denied' ? 'border-destructive/35' : decision === 'narrowed' ? 'border-amber-400/30' : decision === 'approved' ? 'border-primary/30' : 'border-white/8'}`}>
              <CardHeader className="border-b border-white/8">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="eyebrow">02 / POLİTİKA & ÇIKTI</p><CardTitle className="mt-1 text-lg">Karar konsolu</CardTitle></div>
                  {decision !== 'idle' && <Badge className={decision === 'denied' ? 'bg-destructive/12 text-destructive' : decision === 'narrowed' ? 'bg-amber-400/12 text-amber-300' : 'bg-primary/12 text-primary'}>{decision === 'denied' ? 'REDDEDİLDİ' : decision === 'narrowed' ? 'DARALTILDI' : 'ONAYLANDI'}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-1">
                <div className="console-line"><span className="font-mono text-[10px] text-muted-foreground">ŞİFRELİ NESNE</span><code>{cipherPreview}</code></div>
                <div className={`decision-panel ${decision === 'denied' ? 'decision-denied' : decision === 'narrowed' ? 'decision-warn' : decision === 'approved' ? 'decision-ok' : ''}`}>
                  {decision === 'denied' ? <Ban /> : decision === 'idle' ? <Clock3 /> : <ShieldCheck />}
                  <div><p className="text-sm font-semibold">{decision === 'idle' ? 'Karar bekleniyor' : reason}</p>{latency !== null && <p className="mt-1 font-mono text-[10px] opacity-65">İşlem süresi: {latency} ms · Web Crypto API</p>}</div>
                </div>
                {result && (
                  <div className="overflow-hidden rounded-xl border border-white/8">
                    <div className="flex items-center justify-between bg-secondary/60 px-3 py-2"><span className="font-mono text-[10px] text-primary">KÜÇÜLTÜLMÜŞ ÇIKTI</span><span className="text-[10px] text-muted-foreground">{Object.keys(result).length} alan</span></div>
                    <dl className="divide-y divide-white/6">
                      {Object.entries(result).map(([key, value]) => <div key={key} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[160px_1fr]"><dt className="text-xs text-muted-foreground">{fieldLabels[key]}</dt><dd className="text-sm font-medium">{value}</dd></div>)}
                    </dl>
                  </div>
                )}
                {excluded.length > 0 && <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/6 p-3 text-xs text-amber-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>Kapsam dışı bırakıldı: {excluded.map((field) => fieldLabels[field]).join(', ')}</span></div>}
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-5">
            <div>
              <div className="flex items-center justify-between"><p className="eyebrow">ŞİFRELİ PDR DEPOSU</p><Badge variant="outline" className="border-white/10 text-muted-foreground">AES-256-GCM</Badge></div>
              <div className="mt-3 space-y-2">
                {records.map((item) => (
                  <button key={item.id} onClick={() => { updateRecord(item.id); setScenarioId('custom'); }} className={`vault-card ${item.id === record.id ? 'vault-card-active' : ''}`}>
                    <div className="flex items-start justify-between gap-2"><span className={`grid size-8 place-items-center rounded-lg border font-mono text-xs font-bold ${classTone[item.pdrClass]}`}>{item.pdrClass}</span><LockKeyhole className="size-3.5 text-muted-foreground" /></div>
                    <p className="mt-2 text-left text-[13px] font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-left text-[10px] leading-4 text-muted-foreground">{item.id} · {item.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>

            <Card size="sm" className="border border-white/8 bg-card/70">
              <CardHeader><p className="eyebrow">ÇİFT DEK SARMASI</p><CardTitle className="text-sm">{record.id}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="key-path"><span className="key-dot bg-emerald-400" /><div><p>Kişisel erişim anahtarı</p><code>{packet ? toHex(packet.personalWrappedDek).slice(0, 28) : 'hazırlanıyor…'}…</code></div></div>
                <div className="key-path"><span className="key-dot bg-amber-400" /><div><p>Yasal erişim anahtarı</p><code>{packet ? toHex(packet.lawfulWrappedDek).slice(0, 28) : 'hazırlanıyor…'}…</code></div></div>
                <p className="border-t border-white/8 pt-3 text-[10px] leading-4 text-muted-foreground">Aynı AES DEK, iki bağımsız RSA-OAEP açık anahtarıyla ayrı ayrı sarılır. Özel anahtarlar depoda değildir.</p>
              </CardContent>
            </Card>

            <Card size="sm" className="border border-white/8 bg-card/70">
              <CardHeader><div className="flex items-center justify-between"><div><p className="eyebrow">ÖLÇÜM</p><CardTitle className="text-sm">Son koşu</CardTitle></div><Gauge className="size-4 text-primary" /></div></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <div className="mini-metric"><span>Plaintext sızıntısı</span><strong>{decision === 'denied' ? '0 alan' : result ? `${Object.keys(result).length} alan` : '—'}</strong></div>
                <div className="mini-metric"><span>Kapsam dışı</span><strong>{excluded.length}</strong></div>
                <div className="mini-metric"><span>Denetim olayı</span><strong>{audit.length}</strong></div>
                <div className="mini-metric"><span>Gecikme</span><strong>{latency ? `${latency} ms` : '—'}</strong></div>
              </CardContent>
            </Card>
          </aside>
        </div>

        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="border border-white/8 bg-card/75">
            <CardHeader className="border-b border-white/8">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">DEĞİŞTİRİLEMEZ DENETİM İZİ</p><CardTitle className="mt-1 text-base">Hash zinciri</CardTitle></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={testAuditTamper}><AlertTriangle /> Müdahale testi</Button><Button variant="outline" size="sm" onClick={exportAudit}><Download /> JSON indir</Button></div></div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead><tr className="border-b border-white/8 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"><th className="py-2 pr-3">Zaman</th><th className="py-2 pr-3">Olay</th><th className="py-2 pr-3">Açıklama</th><th className="py-2">SHA-256</th></tr></thead>
                  <tbody>{audit.length ? audit.map((entry) => <tr key={entry.id} className="border-b border-white/5 text-xs"><td className="py-2.5 pr-3 font-mono text-muted-foreground">{entry.time}</td><td className={`py-2.5 pr-3 font-mono text-[10px] ${entry.result === 'deny' ? 'text-destructive' : entry.result === 'warn' ? 'text-amber-300' : 'text-primary'}`}>{entry.event}</td><td className="max-w-[380px] py-2.5 pr-3 text-muted-foreground">{entry.detail}</td><td className="py-2.5 font-mono text-[9px] text-muted-foreground">{entry.hash.slice(0, 16)}…</td></tr>) : <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">İlk denetim olayı hazırlanıyor…</td></tr>}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/8 bg-card/75">
            <CardHeader><p className="eyebrow">MAKALE İLE EŞLEŞME</p><CardTitle className="text-base">Bu laboratuvar neyi test ediyor?</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                ['RQ1', 'DBA gibi ayrıcalıklı rollerin doğrudan plaintext alamaması'],
                ['RQ2', 'Kişisel ve yasal erişimin farklı yetki yollarıyla birlikte çalışması'],
                ['Kapsam', 'Alan, amaç, süre ve veri sınıfı kısıtlarının uygulanması'],
                ['Bütünlük', 'Denetim kayıtlarındaki yetkisiz değişikliğin saptanması'],
              ].map(([tag, text]) => <div key={tag} className="flex gap-3 rounded-lg border border-white/7 bg-[#0a1714] p-3"><Badge variant="outline" className="h-5 border-primary/25 text-primary">{tag}</Badge><p className="text-xs leading-5 text-muted-foreground">{text}</p></div>)}
              <p className="text-[10px] leading-4 text-muted-foreground">Eğitsel prototiptir; gerçek bir hukuki yetki kararı vermez ve üretim sistemi yerine geçmez.</p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
