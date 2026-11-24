import React, { useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Copy,
  Download,
  Gift,
  Megaphone,
  MessageCircle,
  Sparkles,
  Star,
  UserPlus,
} from 'lucide-react';
import {
  formatShortDatePT,
  LOST_REASONS,
  SEASONAL_CAMPAIGN_TEMPLATES,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import { buildWhatsAppUrl } from '../../utils/calculations';
import { EmptyState, PrimaryButton, StatusBadge } from '../common/UIPrimitives';

type MarketingSubTab = 'reviews' | 'campaigns' | 'referrals' | 'before_after';

export const MarketingView: React.FC = () => {
  const { db, organization, registerClientReferral, showToast } = useZelvo();
  const [subTab, setSubTab] = useState<MarketingSubTab>('reviews');

  // Campaigns state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    SEASONAL_CAMPAIGN_TEMPLATES[0].id
  );
  const [lostReasonFilter, setLostReasonFilter] = useState<string>('ALL');

  // Referrals state
  const [referrerClientId, setReferrerClientId] = useState<string>(() => {
    const first = db.clients.find((c) => !c.deleted_at && !c.is_anonymized);
    return first?.id ?? '';
  });
  const [neighborName, setNeighborName] = useState('');
  const [neighborPhone, setNeighborPhone] = useState('');

  // Before / After creator state
  const beforePhotos = useMemo(
    () => db.job_media.filter((m) => !m.deleted_at && m.media_type === 'BEFORE'),
    [db.job_media]
  );
  const afterPhotos = useMemo(
    () => db.job_media.filter((m) => !m.deleted_at && m.media_type === 'AFTER'),
    [db.job_media]
  );

  const [selectedBeforeId, setSelectedBeforeId] = useState<string>(
    () => beforePhotos[0]?.id ?? ''
  );
  const [selectedAfterId, setSelectedAfterId] = useState<string>(
    () => afterPhotos[0]?.id ?? ''
  );
  const [generatedCompositeUrl, setGeneratedCompositeUrl] = useState<string | null>(null);
  const [isGeneratingComposite, setIsGeneratingComposite] = useState<boolean>(false);

  const activeClients = useMemo(
    () => db.clients.filter((c) => !c.deleted_at && !c.is_anonymized),
    [db.clients]
  );

  const completedJobs = useMemo(
    () =>
      db.jobs
        .filter((j) => !j.deleted_at && j.status === 'COMPLETED')
        .sort((a, b) => b.scheduled_start.localeCompare(a.scheduled_start)),
    [db.jobs]
  );

  const lostLeads = useMemo(() => {
    return db.leads.filter((l) => {
      if (l.deleted_at || l.status !== 'LOST') return false;
      if (lostReasonFilter === 'ALL') return true;
      return l.lost_reason === lostReasonFilter;
    });
  }, [db.leads, lostReasonFilter]);

  const activeCampaignTemplate =
    SEASONAL_CAMPAIGN_TEMPLATES.find((t) => t.id === selectedTemplateId) ??
    SEASONAL_CAMPAIGN_TEMPLATES[0];

  const handleCopyCode = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copiado para a área de transferência.`, 'success');
    } catch {
      showToast(`Código: ${text}`, 'info');
    }
  };

  const handleRegisterReferral = (e: React.FormEvent) => {
    e.preventDefault();
    if (!referrerClientId || !neighborName.trim() || !neighborPhone.trim()) return;
    registerClientReferral(referrerClientId, neighborName.trim(), neighborPhone.trim());
    setNeighborName('');
    setNeighborPhone('');
  };

  const handleGenerateBeforeAfter = async () => {
    const beforeItem = beforePhotos.find((m) => m.id === selectedBeforeId) ?? beforePhotos[0];
    const afterItem = afterPhotos.find((m) => m.id === selectedAfterId) ?? afterPhotos[0];
    if (!beforeItem || !afterItem) {
      showToast('Selecione uma fotografia de ANTES e outra de DEPOIS.', 'warning');
      return;
    }

    setIsGeneratingComposite(true);
    try {
      const loadImg = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Falha ao carregar imagem.'));
          img.src = src;
        });

      const [imgBefore, imgAfter] = await Promise.all([
        loadImg(beforeItem.data_url),
        loadImg(afterItem.data_url),
      ]);

      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível.');

      // Dark branded header bar
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, 1200, 96);

      // Emerald accent strip
      ctx.fillStyle = '#10B981';
      ctx.fillRect(0, 96, 1200, 8);

      // Company Name & Subtitle
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
      ctx.fillText(organization.name, 36, 58);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 18px system-ui, -apple-system, sans-serif';
      ctx.fillText('TRANSFORMAÇÃO ANTES & DEPOIS · SERVIÇO NO TERRENO', 36, 84);

      // Draw photo helper (cover fit)
      const drawCover = (
        img: HTMLImageElement,
        dx: number,
        dy: number,
        dw: number,
        dh: number
      ) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, dw, dh);
        ctx.clip();
        const imgRatio = img.width / Math.max(1, img.height);
        const boxRatio = dw / dh;
        let sx = 0;
        let sy = 0;
        let sw = img.width;
        let sh = img.height;
        if (imgRatio > boxRatio) {
          sw = img.height * boxRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / boxRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.restore();
      };

      const photoTop = 104;
      const photoHeight = 548;
      drawCover(imgBefore, 0, photoTop, 596, photoHeight);
      drawCover(imgAfter, 604, photoTop, 596, photoHeight);

      // Center white divider
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(596, photoTop, 8, photoHeight);

      // ANTES badge
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(24, photoTop + 24, 150, 44);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.fillText('ANTES', 58, photoTop + 54);

      // DEPOIS badge
      ctx.fillStyle = '#10B981';
      ctx.fillRect(628, photoTop + 24, 165, 44);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('DEPOIS', 662, photoTop + 54);

      // Branded footer
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 652, 1200, 68);
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 20px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        `Peça já o seu orçamento · Tel.: ${organization.phone ?? '912 345 678'}`,
        36,
        694
      );
      ctx.fillStyle = '#10B981';
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      ctx.fillText('zelvo', 1105, 694);

      setGeneratedCompositeUrl(canvas.toDataURL('image/png'));
      showToast('Imagem Antes/Depois pronta para redes sociais!', 'success');
    } catch {
      showToast('Não foi possível compor as fotografias selecionadas.', 'danger');
    } finally {
      setIsGeneratingComposite(false);
    }
  };

  const handleDownloadComposite = () => {
    if (!generatedCompositeUrl) return;
    const link = document.createElement('a');
    link.href = generatedCompositeUrl;
    link.download = `zelvo-antes-depois-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Imagem PNG descarregada com sucesso.', 'success');
  };

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
        {[
          { id: 'reviews' as const, label: 'Google Reviews', icon: Star },
          { id: 'campaigns' as const, label: 'Campanhas', icon: Megaphone },
          { id: 'referrals' as const, label: 'Traga Vizinho', icon: Gift },
          { id: 'before_after' as const, label: 'Antes/Depois', icon: Camera },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`min-h-11 px-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                active
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. GOOGLE REVIEWS */}
      {subTab === 'reviews' && (
        <div className="space-y-3">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0">
                <Star className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#0F172A]">
                  Pedidos de Avaliação Google (1-Clique)
                </h3>
                <p className="text-[14px] text-[#475569] mt-0.5">
                  Envie uma mensagem pronta por WhatsApp aos clientes com visitas concluídas
                  recentemente para conquistar 5 estrelas no Google.
                </p>
              </div>
            </div>
          </div>

          {completedJobs.length === 0 ? (
            <EmptyState
              icon={<Star className="w-6 h-6" />}
              title="Sem visitas concluídas"
              description="Assim que concluir um serviço, pode pedir avaliação Google por aqui."
            />
          ) : (
            <div className="space-y-2.5">
              {completedJobs.slice(0, 8).map((job) => {
                const client = db.clients.find((c) => c.id === job.client_id);
                if (!client || client.is_anonymized) return null;
                const reviewMsg = `Olá ${client.name}! Muito obrigado pela confiança na ${organization.name} no serviço "${job.title}". Se ficou satisfeito com o resultado, pode deixar-nos uma avaliação de 5 estrelas no Google? Demora 20 segundos: https://g.page/r/${organization.slug}/review`;
                return (
                  <div
                    key={job.id}
                    className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-[16px] font-bold text-[#0F172A]">{client.name}</p>
                      <p className="text-[13px] text-[#475569]">
                        {job.title} · {formatShortDatePT(job.scheduled_start)}
                      </p>
                    </div>
                    <a
                      href={buildWhatsAppUrl(client.phone, reviewMsg)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        showToast(`Pedido de avaliação preparado para ${client.name}.`, 'success')
                      }
                      className="inline-flex items-center justify-center gap-2 min-h-12 px-4 rounded-[10px] bg-[#10B981] hover:bg-[#059669] text-white text-[14px] font-semibold whitespace-nowrap shrink-0"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Pedir Avaliação Google</span>
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. SEASONAL CAMPAIGNS */}
      {subTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
            <h3 className="text-[17px] font-bold text-[#0F172A]">
              Campanhas Sazonais &amp; Recuperação de Leads
            </h3>
            <p className="text-[14px] text-[#475569]">
              Escolha um modelo sazonal e reative leads perdidos ou clientes inativos via
              WhatsApp.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SEASONAL_CAMPAIGN_TEMPLATES.map((tpl) => {
                const selected = tpl.id === selectedTemplateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                      selected
                        ? 'border-[#10B981] bg-[#ECFDF5] text-[#0F172A]'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:border-slate-300'
                    }`}
                  >
                    <p className="text-[14px] font-bold">{tpl.title}</p>
                    <p className="text-[12px] mt-1 line-clamp-2">{tpl.message}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0]">
              <label className="text-[13px] font-semibold text-[#0F172A]">
                Filtrar Leads Perdidos por motivo:
              </label>
              <select
                value={lostReasonFilter}
                onChange={(e) => setLostReasonFilter(e.target.value)}
                className="min-h-11 px-3 rounded-lg border border-[#CBD5E1] text-[14px] bg-white"
              >
                <option value="ALL">Todos os motivos ({db.leads.filter((l) => !l.deleted_at && l.status === 'LOST').length})</option>
                {LOST_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-[15px] font-bold text-[#0F172A]">
              Leads Perdidos Elegíveis ({lostLeads.length})
            </h4>
            {lostLeads.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="w-6 h-6" />}
                title="Sem leads perdidos com este filtro"
                description="Altere o motivo de perda para ver outros contactos recuperáveis."
              />
            ) : (
              lostLeads.map((lead) => {
                const msg = activeCampaignTemplate.message.replace('{nome}', lead.name);
                return (
                  <div
                    key={lead.id}
                    className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[16px] font-bold text-[#0F172A]">{lead.name}</p>
                        {lead.lost_reason && (
                          <StatusBadge tone="warning" label={lead.lost_reason} />
                        )}
                      </div>
                      <p className="text-[13px] text-[#475569]">
                        {lead.address || 'Braga'} · {lead.description}
                      </p>
                    </div>
                    <a
                      href={buildWhatsAppUrl(lead.phone, msg)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        showToast(`Campanha "${activeCampaignTemplate.title}" aberta para ${lead.name}.`, 'info')
                      }
                      className="inline-flex items-center justify-center gap-2 min-h-12 px-4 rounded-[10px] bg-[#1E293B] hover:bg-slate-800 text-white text-[14px] font-semibold whitespace-nowrap shrink-0"
                    >
                      <MessageCircle className="w-4 h-4 text-[#10B981]" />
                      <span>Enviar Campanha</span>
                    </a>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. BRING A NEIGHBOR REFERRALS */}
      {subTab === 'referrals' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#CCFBF1] text-[#0F766E] flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#0F172A]">
                  Programa &ldquo;Traga um Vizinho&rdquo; (-15%)
                </h3>
                <p className="text-[14px] text-[#475569] mt-0.5">
                  Registe uma indicação para criar o lead do vizinho e aplicar automaticamente
                  <strong> 15% de desconto</strong> na próxima visita do cliente indicador.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleRegisterReferral}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#E2E8F0]"
            >
              <div>
                <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
                  Cliente que indicou
                </label>
                <select
                  value={referrerClientId}
                  onChange={(e) => setReferrerClientId(e.target.value)}
                  className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] text-[15px] bg-white"
                >
                  {activeClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.referral_code ?? 'ZELVO15'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
                  Nome do Vizinho *
                </label>
                <input
                  type="text"
                  required
                  value={neighborName}
                  onChange={(e) => setNeighborName(e.target.value)}
                  placeholder="Ex.: António Ferreira"
                  className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] text-[15px]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
                  Telemóvel do Vizinho *
                </label>
                <input
                  type="tel"
                  required
                  value={neighborPhone}
                  onChange={(e) => setNeighborPhone(e.target.value)}
                  placeholder="912 000 000"
                  className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] text-[15px] tabular-nums"
                />
              </div>
              <div className="sm:col-span-3">
                <PrimaryButton type="submit" fullWidth icon={<UserPlus className="w-4 h-4" />}>
                  Registar Indicação e Aplicar 15% Desconto
                </PrimaryButton>
              </div>
            </form>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-[15px] font-bold text-[#0F172A]">
              Códigos de Indicação dos Clientes
            </h4>
            {activeClients.map((client) => {
              const code = client.referral_code ?? 'ZELVO15';
              const shareText = `Olá ${client.name}! Partilhe o seu código exclusivo ${code} com um vizinho em Braga. Quando ele marcar connosco (${organization.name}), ambos ganham 15% de desconto na próxima visita! Link: https://zelvo.pt/pedir/${organization.slug}?ref=${code}`;
              return (
                <div
                  key={client.id}
                  className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[16px] font-bold text-[#0F172A]">{client.name}</p>
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-100 border border-[#CBD5E1] font-mono text-[13px] font-bold text-[#0F172A]">
                        {code}
                      </span>
                      {(client.referral_discount_pct ?? 0) > 0 && (
                        <StatusBadge
                          tone="success"
                          label={`-${client.referral_discount_pct}% ativo`}
                          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        />
                      )}
                    </div>
                    <p className="text-[13px] text-[#475569] tabular-nums">
                      Vizinhos indicados: <strong>{client.referrals_count ?? 0}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(code, 'Código de indicação')}
                      className="min-h-11 px-3 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[13px] font-semibold text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copiar</span>
                    </button>
                    <a
                      href={buildWhatsAppUrl(client.phone, shareText)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-11 px-3.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-[13px] font-semibold inline-flex items-center gap-1.5"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Enviar Link</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. BEFORE / AFTER CREATOR */}
      {subTab === 'before_after' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-4">
            <div>
              <h3 className="text-[17px] font-bold text-[#0F172A]">
                Criador de Imagem Antes &amp; Depois
              </h3>
              <p className="text-[14px] text-[#475569] mt-0.5">
                Escolha 1 foto de ANTES e 1 foto de DEPOIS para gerar uma montagem pronta a
                partilhar no Instagram, Facebook ou WhatsApp com a marca {organization.name}.
              </p>
            </div>

            {beforePhotos.length === 0 || afterPhotos.length === 0 ? (
              <EmptyState
                icon={<Camera className="w-6 h-6" />}
                title="Fotografias insuficientes"
                description="Registe pelo menos uma fotografia de ANTES e outra de DEPOIS numa visita para gerar a montagem."
              />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* BEFORE Picker */}
                  <div className="space-y-2">
                    <p className="text-[14px] font-bold text-[#0F172A]">
                      1. Selecionar Foto ANTES
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {beforePhotos.map((m) => {
                        const selected = (selectedBeforeId || beforePhotos[0].id) === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedBeforeId(m.id)}
                            className={`rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                              selected
                                ? 'border-[#10B981] ring-2 ring-[#10B981]/30'
                                : 'border-[#E2E8F0]'
                            }`}
                          >
                            <img
                              src={m.data_url}
                              alt="Foto Antes"
                              className="w-full h-24 object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* AFTER Picker */}
                  <div className="space-y-2">
                    <p className="text-[14px] font-bold text-[#0F172A]">
                      2. Selecionar Foto DEPOIS
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {afterPhotos.map((m) => {
                        const selected = (selectedAfterId || afterPhotos[0].id) === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedAfterId(m.id)}
                            className={`rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                              selected
                                ? 'border-[#10B981] ring-2 ring-[#10B981]/30'
                                : 'border-[#E2E8F0]'
                            }`}
                          >
                            <img
                              src={m.data_url}
                              alt="Foto Depois"
                              className="w-full h-24 object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <PrimaryButton
                  onClick={() => void handleGenerateBeforeAfter()}
                  loading={isGeneratingComposite}
                  icon={<Sparkles className="w-5 h-5" />}
                  fullWidth
                >
                  Gerar Montagem Antes / Depois (PNG)
                </PrimaryButton>
              </>
            )}
          </div>

          {generatedCompositeUrl && (
            <div className="bg-white border border-[#10B981] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-bold text-[#0F172A]">
                  Pré-visualização Pronta a Publicar
                </p>
                <StatusBadge tone="success" label="1200×720 PNG" />
              </div>
              <img
                src={generatedCompositeUrl}
                alt="Montagem Antes e Depois gerada"
                className="w-full rounded-xl border border-[#E2E8F0]"
              />
              <PrimaryButton
                onClick={handleDownloadComposite}
                icon={<Download className="w-5 h-5" />}
                fullWidth
              >
                Descarregar PNG para Redes Sociais
              </PrimaryButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
