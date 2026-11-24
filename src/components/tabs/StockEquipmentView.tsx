import React, { useMemo, useState } from 'react';
import { isBefore, parseISO, startOfDay } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Wrench,
} from 'lucide-react';
import {
  formatEUR,
  formatShortDatePT,
  getCategoryLabel,
  INVENTORY_CATEGORIES,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import type { EquipmentItem, EquipmentStatus, InventoryItem } from '../../types/database';
import { EmptyState, Modal, PrimaryButton, StatusBadge } from '../common/UIPrimitives';

type StockSubTab = 'inventory' | 'shopping' | 'equipment';

const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  OK: 'Operacional',
  MAINTENANCE_DUE: 'Revisão Necessária',
  IN_REPAIR: 'Em Oficina',
};

export const StockEquipmentView: React.FC = () => {
  const {
    db,
    isTechnicianMode,
    upsertInventoryItem,
    adjustInventoryStock,
    purchaseInventoryItem,
    upsertEquipment,
    logEquipmentService,
  } = useZelvo();

  const [subTab, setSubTab] = useState<StockSubTab>('inventory');
  const [showItemModal, setShowItemModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showEquipModal, setShowEquipModal] = useState<boolean>(false);
  const [editingEquip, setEditingEquip] = useState<EquipmentItem | null>(null);
  const [restockQuantities, setRestockQuantities] = useState<Record<string, number>>({});

  // Form state for Inventory Item
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('MATERIALS');
  const [itemQty, setItemQty] = useState('10');
  const [itemUnit, setItemUnit] = useState('un');
  const [itemMin, setItemMin] = useState('3');
  const [itemCost, setItemCost] = useState('12');

  // Form state for Equipment
  const [eqName, setEqName] = useState('');
  const [eqBrand, setEqBrand] = useState('');
  const [eqSerial, setEqSerial] = useState('');
  const [eqHours, setEqHours] = useState('0');
  const [eqNextHours, setEqNextHours] = useState('100');
  const [eqNextDate, setEqNextDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eqStatus, setEqStatus] = useState<EquipmentStatus>('OK');
  const [eqNotes, setEqNotes] = useState('');

  const activeInventory = useMemo(
    () =>
      db.inventory_items
        .filter((i) => !i.deleted_at)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [db.inventory_items]
  );

  const lowStockItems = useMemo(
    () => activeInventory.filter((i) => i.quantity <= i.min_stock),
    [activeInventory]
  );

  const activeEquipment = useMemo(
    () =>
      db.equipment
        .filter((e) => !e.deleted_at)
        .sort((a, b) => a.next_service_date.localeCompare(b.next_service_date)),
    [db.equipment]
  );

  const todayStart = startOfDay(new Date());

  const isEquipmentOverdue = (eq: EquipmentItem): boolean => {
    const byDate = isBefore(parseISO(eq.next_service_date), todayStart);
    const byHours = eq.next_service_hours != null && eq.hours_used >= eq.next_service_hours;
    return eq.status !== 'OK' || byDate || byHours;
  };

  const overdueEquipmentCount = useMemo(
    () => activeEquipment.filter(isEquipmentOverdue).length,
    [activeEquipment]
  );

  const openNewItemModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setItemName(item.name);
      const upperCat = item.category.trim().toUpperCase();
      const matchedCat = INVENTORY_CATEGORIES.find((c) => c.id === upperCat)?.id ?? 'MATERIALS';
      setItemCategory(matchedCat);
      setItemQty(String(item.quantity));
      setItemUnit(item.unit);
      setItemMin(String(item.min_stock));
      setItemCost(String(item.unit_cost));
    } else {
      setEditingItem(null);
      setItemName('');
      setItemCategory('MATERIALS');
      setItemQty('5');
      setItemUnit('un');
      setItemMin('2');
      setItemCost('15');
    }
    setShowItemModal(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    upsertInventoryItem({
      id: editingItem?.id,
      name: itemName.trim(),
      category: itemCategory.trim() || 'MATERIALS',
      quantity: Math.max(0, Number(itemQty) || 0),
      unit: itemUnit.trim() || 'un',
      min_stock: Math.max(0, Number(itemMin) || 0),
      unit_cost: Math.max(0, Number(itemCost) || 0),
    });
    setShowItemModal(false);
  };

  const openNewEquipModal = (eq?: EquipmentItem) => {
    if (eq) {
      setEditingEquip(eq);
      setEqName(eq.name);
      setEqBrand(eq.brand_model);
      setEqSerial(eq.serial_or_plate ?? '');
      setEqHours(String(eq.hours_used));
      setEqNextHours(eq.next_service_hours != null ? String(eq.next_service_hours) : '');
      setEqNextDate(eq.next_service_date);
      setEqStatus(eq.status);
      setEqNotes(eq.notes ?? '');
    } else {
      setEditingEquip(null);
      setEqName('');
      setEqBrand('');
      setEqSerial('');
      setEqHours('0');
      setEqNextHours('100');
      setEqNextDate(new Date().toISOString().slice(0, 10));
      setEqStatus('OK');
      setEqNotes('');
    }
    setShowEquipModal(true);
  };

  const handleSaveEquip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eqName.trim()) return;
    upsertEquipment({
      id: editingEquip?.id,
      name: eqName.trim(),
      brand_model: eqBrand.trim() || 'Modelo Standard',
      serial_or_plate: eqSerial.trim() || null,
      hours_used: Math.max(0, Number(eqHours) || 0),
      next_service_hours: eqNextHours.trim() ? Math.max(0, Number(eqNextHours) || 0) : null,
      next_service_date: eqNextDate,
      status: eqStatus,
      notes: eqNotes.trim() || null,
    });
    setShowEquipModal(false);
  };

  const getSuggestedRestock = (item: InventoryItem): number => {
    const custom = restockQuantities[item.id];
    if (custom != null && custom > 0) return custom;
    return Math.max(1, Math.ceil(item.min_stock * 2 - item.quantity));
  };

  return (
    <div className="space-y-4">
      {/* KPI Overview Strip */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3">
          <p className="text-[12px] font-medium text-[#475569]">Artigos em Stock</p>
          <p className="text-[22px] font-extrabold text-[#0F172A] tabular-nums mt-0.5">
            {activeInventory.length}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3">
          <p className="text-[12px] font-medium text-[#475569]">Abaixo do Mínimo</p>
          <p
            className={`text-[22px] font-extrabold tabular-nums mt-0.5 ${
              lowStockItems.length > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
            }`}
          >
            {lowStockItems.length}
          </p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3">
          <p className="text-[12px] font-medium text-[#475569]">Revisões Atraso</p>
          <p
            className={`text-[22px] font-extrabold tabular-nums mt-0.5 ${
              overdueEquipmentCount > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
            }`}
          >
            {overdueEquipmentCount}
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
        <button
          type="button"
          onClick={() => setSubTab('inventory')}
          className={`min-h-11 px-2 rounded-lg text-[13px] sm:text-[14px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            subTab === 'inventory'
              ? 'bg-white text-[#0F172A] shadow-xs'
              : 'text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          <Package className="w-4 h-4 shrink-0" />
          <span>Inventário</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('shopping')}
          className={`min-h-11 px-2 rounded-lg text-[13px] sm:text-[14px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            subTab === 'shopping'
              ? 'bg-white text-[#0F172A] shadow-xs'
              : 'text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          <ShoppingCart className="w-4 h-4 shrink-0" />
          <span>Compras</span>
          {lowStockItems.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#DC2626] text-white text-[11px] font-bold tabular-nums">
              {lowStockItems.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('equipment')}
          className={`min-h-11 px-2 rounded-lg text-[13px] sm:text-[14px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            subTab === 'equipment'
              ? 'bg-white text-[#0F172A] shadow-xs'
              : 'text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          <Wrench className="w-4 h-4 shrink-0" />
          <span>Máquinas</span>
          {overdueEquipmentCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#B45309] text-white text-[11px] font-bold tabular-nums">
              {overdueEquipmentCount}
            </span>
          )}
        </button>
      </div>

      {/* 1. INVENTORY TAB */}
      {subTab === 'inventory' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[17px] font-bold text-[#0F172A]">Stock de Materiais</h3>
              <p className="text-[13px] text-[#475569]">
                Descontado automaticamente ao registar consumos durante uma visita.
              </p>
            </div>
            {!isTechnicianMode && (
              <PrimaryButton
                onClick={() => openNewItemModal()}
                icon={<Plus className="w-4 h-4" />}
                className="!min-h-11 !text-[14px] !px-3.5"
              >
                Novo Artigo
              </PrimaryButton>
            )}
          </div>

          {activeInventory.length === 0 ? (
            <EmptyState
              icon={<Package className="w-6 h-6" />}
              title="Sem materiais em stock"
              description="Adicione adubos, combustíveis, fio de nylon ou consumíveis para controlar existências."
              actionLabel={!isTechnicianMode ? 'Adicionar Artigo' : undefined}
              onAction={!isTechnicianMode ? () => openNewItemModal() : undefined}
            />
          ) : (
            <div className="space-y-2.5">
              {activeInventory.map((item) => {
                const isLow = item.quantity <= item.min_stock;
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isLow ? 'border-[#FCA5A5] bg-[#FEF2F2]/40' : 'border-[#E2E8F0]'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[16px] font-bold text-[#0F172A]">{item.name}</h4>
                        <StatusBadge
                          tone={isLow ? 'danger' : 'success'}
                          label={isLow ? 'Stock Baixo' : 'Disponível'}
                        />
                        <span className="text-[12px] font-medium text-[#475569]">
                          {getCategoryLabel(item.category)}
                        </span>
                      </div>
                      <p className="text-[14px] text-[#475569] tabular-nums">
                        Atual:{' '}
                        <strong className={isLow ? 'text-[#B91C1C]' : 'text-[#0F172A]'}>
                          {item.quantity} {item.unit}
                        </strong>{' '}
                        · Mínimo: {item.min_stock} {item.unit}
                        {!isTechnicianMode && ` · Custo unit.: ${formatEUR(item.unit_cost)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => adjustInventoryStock(item.id, -1)}
                        disabled={item.quantity <= 0}
                        aria-label={`Remover 1 ${item.unit} de ${item.name}`}
                        className="min-h-11 min-w-11 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 flex items-center justify-center text-[#0F172A] disabled:opacity-40 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustInventoryStock(item.id, 1)}
                        aria-label={`Adicionar 1 ${item.unit} de ${item.name}`}
                        className="min-h-11 min-w-11 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 flex items-center justify-center text-[#0F172A] cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      {!isTechnicianMode && (
                        <button
                          type="button"
                          onClick={() => openNewItemModal(item)}
                          className="min-h-11 px-3 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[13px] font-semibold text-[#0F172A] cursor-pointer"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. AUTOMATIC SHOPPING LIST TAB */}
      {subTab === 'shopping' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-[17px] font-bold text-[#0F172A]">
              Lista de Compras Automática
            </h3>
            <p className="text-[13px] text-[#475569]">
              Artigos com stock igual ou inferior ao mínimo. Ao marcar como comprado, o stock é
              reposto e a despesa é lançada automaticamente em Finanças.
            </p>
          </div>

          {lowStockItems.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-6 h-6 text-[#15803D]" />}
              title="Lista de compras vazia"
              description="Todos os artigos de inventário estão acima do nível mínimo configurado."
            />
          ) : (
            <div className="space-y-3">
              {lowStockItems.map((item) => {
                const qtyToBuy = getSuggestedRestock(item);
                const estimatedTotal = qtyToBuy * item.unit_cost;
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-[#FCA5A5] p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0" />
                          <h4 className="text-[16px] font-bold text-[#0F172A]">{item.name}</h4>
                        </div>
                        <p className="text-[14px] text-[#475569] tabular-nums mt-0.5">
                          Em armazém:{' '}
                          <strong className="text-[#B91C1C]">
                            {item.quantity} {item.unit}
                          </strong>{' '}
                          (mínimo: {item.min_stock} {item.unit})
                        </p>
                      </div>
                      {!isTechnicianMode && (
                        <div className="text-right shrink-0">
                          <p className="text-[12px] text-[#64748B]">Custo estimado</p>
                          <p className="text-[17px] font-extrabold text-[#0F172A] tabular-nums">
                            {formatEUR(estimatedTotal)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F1F5F9]">
                      <label className="flex items-center gap-2 text-[14px] font-medium text-[#0F172A]">
                        <span>Qtd. a comprar:</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={qtyToBuy}
                          onChange={(e) =>
                            setRestockQuantities((prev) => ({
                              ...prev,
                              [item.id]: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                          className="w-20 min-h-11 px-2.5 rounded-lg border border-[#CBD5E1] text-center font-bold tabular-nums"
                        />
                        <span className="text-[#475569]">{item.unit}</span>
                      </label>

                      <PrimaryButton
                        onClick={() => purchaseInventoryItem(item.id, qtyToBuy)}
                        icon={<CheckCircle2 className="w-4 h-4" />}
                        className="flex-1 sm:flex-none"
                      >
                        Marcar Comprado
                      </PrimaryButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. EQUIPMENT & FLEET TAB */}
      {subTab === 'equipment' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[17px] font-bold text-[#0F172A]">Equipamentos &amp; Frota</h3>
              <p className="text-[13px] text-[#475569]">
                Controlo de horas de uso e alertas de revisões periódicas.
              </p>
            </div>
            {!isTechnicianMode && (
              <PrimaryButton
                onClick={() => openNewEquipModal()}
                icon={<Plus className="w-4 h-4" />}
                className="!min-h-11 !text-[14px] !px-3.5"
              >
                Novo Equipamento
              </PrimaryButton>
            )}
          </div>

          {activeEquipment.length === 0 ? (
            <EmptyState
              icon={<Wrench className="w-6 h-6" />}
              title="Sem máquinas registadas"
              description="Registe corta-relvas, roçadoras ou carrinhas para acompanhar revisões."
            />
          ) : (
            <div className="space-y-3">
              {activeEquipment.map((eq) => {
                const overdue = isEquipmentOverdue(eq);
                return (
                  <div
                    key={eq.id}
                    className={`bg-white rounded-xl border p-4 space-y-3 ${
                      overdue ? 'border-[#F59E0B] bg-[#FFFBEB]/50' : 'border-[#E2E8F0]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-[16px] font-bold text-[#0F172A]">{eq.name}</h4>
                          <StatusBadge
                            tone={
                              eq.status === 'IN_REPAIR'
                                ? 'danger'
                                : overdue
                                  ? 'warning'
                                  : 'success'
                            }
                            label={
                              overdue && eq.status === 'OK'
                                ? 'Revisão Atrasada'
                                : EQUIPMENT_STATUS_LABEL[eq.status]
                            }
                          />
                        </div>
                        <p className="text-[14px] text-[#475569] mt-0.5">
                          {eq.brand_model}
                          {eq.serial_or_plate ? ` · ${eq.serial_or_plate}` : ''}
                        </p>
                      </div>
                      {!isTechnicianMode && (
                        <button
                          type="button"
                          onClick={() => openNewEquipModal(eq)}
                          className="min-h-10 px-3 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[13px] font-semibold text-[#0F172A] cursor-pointer"
                        >
                          Editar
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[13px] bg-[#F8FAFC] rounded-lg p-3 border border-[#E2E8F0]">
                      <div>
                        <p className="text-[#64748B]">Horas / Uso atual</p>
                        <p className="font-bold text-[#0F172A] tabular-nums mt-0.5">
                          {eq.hours_used} h
                          {eq.next_service_hours != null
                            ? ` / ${eq.next_service_hours} h`
                            : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#64748B]">Próxima revisão</p>
                        <p
                          className={`font-bold tabular-nums mt-0.5 ${
                            overdue ? 'text-[#B45309]' : 'text-[#0F172A]'
                          }`}
                        >
                          {formatShortDatePT(eq.next_service_date)}
                        </p>
                      </div>
                    </div>

                    {eq.notes && (
                      <p className="text-[13px] text-[#475569] bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/80">
                        {eq.notes}
                      </p>
                    )}

                    {overdue && (
                      <div className="flex items-center justify-end">
                        <PrimaryButton
                          onClick={() => logEquipmentService(eq.id)}
                          icon={<CheckCircle2 className="w-4 h-4" />}
                          fullWidth
                        >
                          Registar Revisão Efetuada (+90 dias)
                        </PrimaryButton>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Inventory Modal */}
      <Modal
        open={showItemModal}
        onClose={() => setShowItemModal(false)}
        title={editingItem ? 'Editar Artigo de Stock' : 'Novo Artigo de Stock'}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Nome do material *
            </label>
            <input
              type="text"
              required
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Ex.: Adubo NPK 25kg"
              className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[16px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Categoria
              </label>
              <select
                value={itemCategory}
                onChange={(e) => setItemCategory(e.target.value)}
                className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[16px] bg-white text-[#0F172A]"
              >
                {INVENTORY_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Unidade
              </label>
              <input
                type="text"
                value={itemUnit}
                onChange={(e) => setItemUnit(e.target.value)}
                placeholder="sacos, litros, un"
                className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[16px]"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Stock Atual
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={itemQty}
                onChange={(e) => setItemQty(e.target.value)}
                className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] text-[16px] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Stock Mínimo
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={itemMin}
                onChange={(e) => setItemMin(e.target.value)}
                className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] text-[16px] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Custo (€)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={itemCost}
                onChange={(e) => setItemCost(e.target.value)}
                className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] text-[16px] tabular-nums"
              />
            </div>
          </div>
          <PrimaryButton type="submit" fullWidth>
            Guardar Artigo
          </PrimaryButton>
        </form>
      </Modal>

      {/* Add / Edit Equipment Modal */}
      <Modal
        open={showEquipModal}
        onClose={() => setShowEquipModal(false)}
        title={editingEquip ? 'Editar Equipamento' : 'Novo Equipamento / Viatura'}
      >
        <form onSubmit={handleSaveEquip} className="space-y-4">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Nome do equipamento *
            </label>
            <input
              type="text"
              required
              value={eqName}
              onChange={(e) => setEqName(e.target.value)}
              placeholder="Ex.: Roçadora Profissional"
              className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[16px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Marca / Modelo
              </label>
              <input
                type="text"
                value={eqBrand}
                onChange={(e) => setEqBrand(e.target.value)}
                className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[16px]"
              />
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                N.º Série / Matrícula
              </label>
              <input
                type="text"
                value={eqSerial}
                onChange={(e) => setEqSerial(e.target.value)}
                className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[16px]"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Horas Uso
              </label>
              <input
                type="number"
                min={0}
                value={eqHours}
                onChange={(e) => setEqHours(e.target.value)}
                className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] text-[16px] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Próx. Rev. (h)
              </label>
              <input
                type="number"
                min={0}
                value={eqNextHours}
                onChange={(e) => setEqNextHours(e.target.value)}
                className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] text-[16px] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                Data Revisão
              </label>
              <input
                type="date"
                value={eqNextDate}
                onChange={(e) => setEqNextDate(e.target.value)}
                className="w-full min-h-12 px-2.5 rounded-xl border border-[#CBD5E1] text-[15px] tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">Estado</label>
            <select
              value={eqStatus}
              onChange={(e) => setEqStatus(e.target.value as EquipmentStatus)}
              className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[16px] bg-white"
            >
              <option value="OK">Operacional</option>
              <option value="MAINTENANCE_DUE">Revisão Necessária</option>
              <option value="IN_REPAIR">Em Oficina</option>
            </select>
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Notas de manutenção
            </label>
            <textarea
              rows={2}
              value={eqNotes}
              onChange={(e) => setEqNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-[#CBD5E1] text-[15px]"
            />
          </div>
          <PrimaryButton type="submit" fullWidth>
            Guardar Equipamento
          </PrimaryButton>
        </form>
      </Modal>
    </div>
  );
};
