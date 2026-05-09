"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ImageGalleryEditor } from "@/components/ImageGalleryEditor";
import { ConfirmDialog } from "@/components/Modal";
import { BuildingArt, MapPreview, UnitArt } from "@/components/PropertyArt";
import { deleteBuilding, deleteUnit } from "@/lib/actions";
import { formatSAR } from "@/lib/format";
import { buildingMeta, type BuildingMeta } from "@/lib/palette";
import {
  localized,
  type Building,
  type Contract,
  type Owner,
  type Tenant,
  type Unit,
} from "@/lib/types";

import { BuildingFormModal } from "./BuildingFormModal";
import type { UserPick } from "./page";
import { UnitFormModal } from "./UnitFormModal";

const UNIT_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  apartment: { en: "Apartment", ar: "شقة" },
  villa: { en: "Villa", ar: "فيلا" },
  office: { en: "Office", ar: "مكتب" },
  shop: { en: "Shop", ar: "محل" },
  warehouse: { en: "Warehouse", ar: "مستودع" },
};

type Lightbox =
  | { kind: "building"; building: Building; meta: BuildingMeta }
  | { kind: "unit"; unit: Unit; building: Building; meta: BuildingMeta };

export function PropertiesClient({
  owners,
  buildings,
  units,
  contracts,
  tenants,
  users,
  locale,
}: {
  owners: Owner[];
  buildings: Building[];
  units: Unit[];
  contracts: Contract[];
  tenants: Tenant[];
  users: UserPick[];
  locale: string;
}) {
  const t = useTranslations("properties");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");

  const [openBuildings, setOpenBuildings] = useState<Set<number>>(() => new Set());
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<Lightbox | null>(null);
  const [search, setSearch] = useState("");
  const [buildingForm, setBuildingForm] = useState<{ open: boolean; editing: Building | null; defaultOwnerId?: number }>({
    open: false,
    editing: null,
  });
  const [unitForm, setUnitForm] = useState<{ open: boolean; editing: Unit | null; defaultBuildingId?: number }>({
    open: false,
    editing: null,
  });
  const [confirmDelBuilding, setConfirmDelBuilding] = useState<Building | null>(null);
  const [confirmDelUnit, setConfirmDelUnit] = useState<Unit | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [gallery, setGallery] = useState<
    | { kind: "buildings"; building: Building }
    | { kind: "units"; unit: Unit; building: Building }
    | null
  >(null);

  const matchesSearch = (b: Building): boolean => {
    if (!search) return true;
    const q = search.toLowerCase();
    const inB = [b.name, b.name_en, b.name_ar, b.address, b.city, b.district]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
    if (inB) return true;
    const us = units.filter((u) => u.building_id === b.id);
    return us.some((u) =>
      [u.name, u.number, u.unit_type].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  };
  const visibleBuildings = buildings.filter(matchesSearch);

  const doDeleteBuilding = () => {
    if (!confirmDelBuilding) return;
    const target = confirmDelBuilding;
    setDelErr(null);
    start(async () => {
      const res = await deleteBuilding(target.id);
      if (!res.ok) {
        setDelErr(res.error);
        return;
      }
      setConfirmDelBuilding(null);
    });
  };

  const doDeleteUnit = () => {
    if (!confirmDelUnit) return;
    const target = confirmDelUnit;
    setDelErr(null);
    start(async () => {
      const res = await deleteUnit(target.id);
      if (!res.ok) {
        setDelErr(res.error);
        return;
      }
      setConfirmDelUnit(null);
    });
  };

  const toggleBuilding = (id: number) => {
    setOpenBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ownerOf = (id: number) => owners.find((o) => o.id === id);
  const userOf = (id: number | null | undefined) =>
    id == null ? null : users.find((u) => u.id === id) ?? null;
  const unitsOf = (bid: number) => units.filter((u) => u.building_id === bid);
  const activeContractFor = (uid: number) =>
    contracts.find((c) => c.unit_id === uid && c.status === "active");
  const tenantOf = (id: number) => tenants.find((tn) => tn.id === id);

  const typeLabel = (type: string | null) => {
    const t = type ?? "apartment";
    return UNIT_TYPE_LABELS[t]?.[locale === "ar" ? "ar" : "en"] ?? t;
  };

  if (buildings.length === 0) {
    return (
      <div className="page screen-enter">
        <div className="page-header">
          <div>
            <h2 className="page-title">{t("title")}</h2>
            <div className="page-subtitle">{t("subtitle")}</div>
          </div>
        </div>
        <div
          style={{
            padding: 60,
            textAlign: "center",
            color: "var(--color-text-secondary)",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            marginTop: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "var(--color-bg-deep)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <span className="ms ms-lg">domain</span>
          </div>
          <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: 16 }}>
            {t("noBuildings")}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{t("noBuildingsHint")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="search-input">
            <span className="ms">search</span>
            <input
              placeholder={tCommon("search") + "…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setBuildingForm({ open: true, editing: null })}
          >
            <span className="ms">add</span> {t("addBuilding")}
          </button>
        </div>
      </div>

      <div className="drill">
        {visibleBuildings.map((b) => {
          const isOpen = openBuildings.has(b.id);
          const owner = ownerOf(b.owner_id);
          const us = unitsOf(b.id);
          const occ = us.filter((u) => !u.is_available).length;
          const occPct = us.length ? Math.round((occ / us.length) * 100) : 0;
          const activeCount = us.reduce(
            (q, u) => q + (activeContractFor(u.id) ? 1 : 0),
            0,
          );
          const meta = buildingMeta(b.id);
          const cityLabel = locale === "ar" ? b.city_ar ?? b.city : b.city_en ?? b.city;
          const districtLabel =
            locale === "ar" ? b.district_ar ?? b.district : b.district_en ?? b.district;

          return (
            <div key={b.id} className={"drill-row prop-row" + (isOpen ? " open" : "")}>
              <div
                className="drill-hd prop-hd"
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => toggleBuilding(b.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleBuilding(b.id);
                  }
                }}
              >
                <span className="ms chev">chevron_right</span>
                <div
                  className="prop-thumb"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox({ kind: "building", building: b, meta });
                  }}
                >
                  <BuildingArt buildingId={b.id} meta={meta} />
                  <span className="prop-thumb-tag">
                    <span className="ms ms-sm">image</span>
                  </span>
                </div>
                <div className="title-block">
                  <div className={locale === "ar" ? "ar" : "en"}>{localized(b, "name", locale)}</div>
                  <div className="meta">
                    <span
                      className="ms ms-sm"
                      style={{ verticalAlign: "middle", marginInlineEnd: 2 }}
                    >
                      location_on
                    </span>
                    {cityLabel}
                    {districtLabel && ` · ${districtLabel}`}
                    {owner && (
                      <>
                        <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
                        <span
                          className="ms ms-sm"
                          style={{ verticalAlign: "middle", marginInlineEnd: 2 }}
                        >
                          person
                        </span>
                        <span>
                          {t("owner")}: {localized(owner, "name", locale)}
                        </span>
                      </>
                    )}
                    {(() => {
                      const a = userOf(b.assignee_id);
                      if (!a) return null;
                      return (
                        <>
                          <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
                          <span
                            className="ms ms-sm"
                            style={{ verticalAlign: "middle", marginInlineEnd: 2 }}
                          >
                            badge
                          </span>
                          <span>
                            {t("assigned")}: {a.username}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="stats">
                  <div className="stat">
                    <div className="num">{us.length}</div>
                    <div className="lbl">{t("nUnits")}</div>
                  </div>
                  <div className="stat">
                    <div className="num">{occPct}%</div>
                    <div className="lbl">{t("occupancy")}</div>
                  </div>
                  <div className="stat">
                    <div className="num">{activeCount}</div>
                    <div className="lbl">{t("nContracts")}</div>
                  </div>
                </div>
                <div
                  className="actions"
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: "flex", gap: 4 }}
                >
                  <button
                    className="icon-btn"
                    title={t("managePhotos")}
                    onClick={() => setGallery({ kind: "buildings", building: b })}
                  >
                    <span className="ms ms-sm">photo_library</span>
                  </button>
                  <button
                    className="icon-btn"
                    title={tCommon("edit")}
                    onClick={() => setBuildingForm({ open: true, editing: b })}
                  >
                    <span className="ms ms-sm">edit</span>
                  </button>
                  <button
                    className="icon-btn"
                    title={tCommon("delete")}
                    onClick={() => setConfirmDelBuilding(b)}
                  >
                    <span className="ms ms-sm">delete</span>
                  </button>
                </div>
              </div>

              <div className="drill-body">
                <div className="prop-detail-grid">
                  <div className="prop-gallery">
                    <div
                      className="prop-hero"
                      onClick={() => setLightbox({ kind: "building", building: b, meta })}
                    >
                      {b.images.length > 0 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.images[0].url}
                          alt={localized(b, "name", locale)}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <BuildingArt buildingId={b.id} meta={meta} cityLabel={cityLabel ?? ""} big />
                      )}
                      <div className="prop-hero-shade" />
                      <div className="prop-hero-actions">
                        <button
                          className="prop-pill"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightbox({ kind: "building", building: b, meta });
                          }}
                        >
                          <span className="ms ms-sm">photo_library</span> {t("viewPhotos")}
                          <span style={{ opacity: 0.7, marginInlineStart: 4 }}>
                            · {b.images.length || 0}
                          </span>
                        </button>
                        <button
                          className="prop-pill"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGallery({ kind: "buildings", building: b });
                          }}
                        >
                          <span className="ms ms-sm">add_a_photo</span> {t("managePhotos")}
                        </button>
                      </div>
                    </div>
                    <div className="prop-thumbs">
                      {b.images.length > 0
                        ? b.images.slice(0, 4).map((img) => (
                            <div
                              key={img.id}
                              className="prop-thumb-sm"
                              onClick={() => setLightbox({ kind: "building", building: b, meta })}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.url}
                                alt=""
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            </div>
                          ))
                        : [0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="prop-thumb-sm"
                              onClick={() => setLightbox({ kind: "building", building: b, meta })}
                            >
                              <BuildingArt buildingId={b.id} meta={meta} />
                            </div>
                          ))}
                      {b.images.length > 4 && (
                        <div
                          className="prop-thumb-sm prop-thumb-more"
                          onClick={() => setLightbox({ kind: "building", building: b, meta })}
                        >
                          <span>+{b.images.length - 4}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="prop-side">
                    <div className="prop-map-card">
                      <div className="prop-map-img">
                        <MapPreview buildingId={b.id} meta={meta} />
                      </div>
                      <div className="prop-map-body">
                        <div className="prop-map-addr">
                          <span className="ms ms-sm" style={{ color: meta.hueA }}>
                            location_on
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              {districtLabel}
                              {districtLabel && cityLabel && ", "}
                              {cityLabel}
                            </div>
                            <div className="text-sec mono" style={{ fontSize: 11 }}>
                              {(b.latitude ?? meta.lat).toFixed(4)}°N · {(b.longitude ?? meta.lng).toFixed(4)}°E
                              {b.latitude == null && (
                                <span style={{ marginInlineStart: 6, opacity: 0.7 }}>· {t("approxLocation")}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="prop-map-actions">
                          {b.latitude != null && b.longitude != null ? (
                            <>
                              <a
                                className="btn btn-secondary btn-sm"
                                style={{ flex: 1 }}
                                href={`https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span className="ms ms-sm">directions</span> {t("directions")}
                              </a>
                              <a
                                className="btn btn-secondary btn-sm"
                                style={{ flex: 1 }}
                                href={`https://www.openstreetmap.org/?mlat=${b.latitude}&mlon=${b.longitude}#map=17/${b.latitude}/${b.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span className="ms ms-sm">open_in_new</span> {t("openMap")}
                              </a>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ flex: 1 }}
                              onClick={() => setBuildingForm({ open: true, editing: b })}
                            >
                              <span className="ms ms-sm">edit_location</span> {t("setLocation")}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="unit-section-hd">
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {t("unitsHeading")}{" "}
                    <span className="text-sec" style={{ fontWeight: 400 }}>
                      · {us.length}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div className="text-sec" style={{ fontSize: 12 }}>
                      {t("clickHint")}
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setUnitForm({ open: true, editing: null, defaultBuildingId: b.id })}
                    >
                      <span className="ms ms-sm">add</span> {t("addUnit")}
                    </button>
                  </div>
                </div>

                <div className="unit-grid">
                  {us.map((u) => {
                    const c = activeContractFor(u.id);
                    const tn = c ? tenantOf(c.tenant_id) : null;
                    return (
                      <div
                        key={u.id}
                        className={
                          "unit-card unit-card-rich" +
                          (selectedUnit === u.id ? " selected" : "")
                        }
                        onClick={() => setSelectedUnit(u.id)}
                      >
                        <div
                          className="unit-img"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightbox({ kind: "unit", unit: u, building: b, meta });
                          }}
                        >
                          {u.images.length > 0 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.images[0].url}
                              alt={localized(u, "name", locale)}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <UnitArt
                              unitId={u.id}
                              unitType={u.unit_type}
                              meta={meta}
                              typeLabel={typeLabel(u.unit_type)}
                            />
                          )}
                          <span
                            className={
                              "badge unit-img-badge " +
                              (u.is_available ? "badge-success" : "badge-danger")
                            }
                          >
                            <span className="dot" />
                            {u.is_available ? t("available") : t("occupied")}
                          </span>
                        </div>
                        <div className="unit-card-body">
                          <div className="top">
                            <div className="num">{u.number}</div>
                            <div className="rent">
                              {tCurrency("sar")} {formatSAR(u.rent_amount, locale)}
                              <span
                                style={{
                                  color: "var(--color-text-secondary)",
                                  fontSize: 11,
                                  fontWeight: 400,
                                }}
                              >
                                /mo
                              </span>
                            </div>
                          </div>
                          <div className="meta">
                            <span>{typeLabel(u.unit_type)}</span>
                            {u.area_sqm && <span>· {u.area_sqm}m²</span>}
                          </div>
                          <div
                            className="actions"
                            style={{ display: "flex", gap: 4, marginTop: 6 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="icon-btn"
                              title={t("managePhotos")}
                              onClick={() => setGallery({ kind: "units", unit: u, building: b })}
                            >
                              <span className="ms ms-sm">photo_library</span>
                            </button>
                            <button
                              className="icon-btn"
                              title={tCommon("edit")}
                              onClick={() => setUnitForm({ open: true, editing: u, defaultBuildingId: b.id })}
                            >
                              <span className="ms ms-sm">edit</span>
                            </button>
                            <button
                              className="icon-btn"
                              title={tCommon("delete")}
                              onClick={() => setConfirmDelUnit(u)}
                            >
                              <span className="ms ms-sm">delete</span>
                            </button>
                          </div>
                          {selectedUnit === u.id && c && (
                            <div
                              className="contract-panel"
                              style={{
                                marginTop: 8,
                                padding: 10,
                                background: "var(--color-bg)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <div
                                  className="mono"
                                  style={{
                                    fontSize: 11,
                                    color: "var(--color-text-secondary)",
                                  }}
                                >
                                  {c.contract_number}
                                </div>
                                <span className="badge badge-success">
                                  <span className="dot" />
                                  {c.status}
                                </span>
                              </div>
                              {tn && (
                                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                                  {localized(tn, "name", locale)}
                                </div>
                              )}
                              <a
                                className="btn btn-secondary btn-sm"
                                style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
                                href={`/${locale}/contracts?id=${c.id}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="ms ms-sm">visibility</span>{" "}
                                {t("viewContract")}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {buildingForm.open && (
        <BuildingFormModal
          key={buildingForm.editing?.id ?? "new-b"}
          open={buildingForm.open}
          onClose={() => setBuildingForm({ open: false, editing: null })}
          building={buildingForm.editing}
          owners={owners}
          users={users}
          defaultOwnerId={buildingForm.defaultOwnerId}
        />
      )}
      {unitForm.open && (
        <UnitFormModal
          key={unitForm.editing?.id ?? "new-u"}
          open={unitForm.open}
          onClose={() => setUnitForm({ open: false, editing: null })}
          unit={unitForm.editing}
          buildings={buildings}
          defaultBuildingId={unitForm.defaultBuildingId}
        />
      )}
      <ConfirmDialog
        open={Boolean(confirmDelBuilding)}
        onClose={() => {
          setConfirmDelBuilding(null);
          setDelErr(null);
        }}
        onConfirm={doDeleteBuilding}
        title={t("deleteBuildingTitle")}
        message={delErr ?? t("deleteBuildingMessage", { name: confirmDelBuilding ? localized(confirmDelBuilding, "name", locale) : "" })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        destructive
        loading={pending}
      />
      <ConfirmDialog
        open={Boolean(confirmDelUnit)}
        onClose={() => {
          setConfirmDelUnit(null);
          setDelErr(null);
        }}
        onConfirm={doDeleteUnit}
        title={t("deleteUnitTitle")}
        message={delErr ?? t("deleteUnitMessage", { number: confirmDelUnit?.number ?? "" })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        destructive
        loading={pending}
      />
      {gallery && (
        <ImageGalleryEditor
          key={gallery.kind === "buildings" ? `b-${gallery.building.id}` : `u-${gallery.unit.id}`}
          open
          onClose={() => setGallery(null)}
          kind={gallery.kind}
          entityId={gallery.kind === "buildings" ? gallery.building.id : gallery.unit.id}
          title={
            gallery.kind === "buildings"
              ? `${t("photosOf")} ${localized(gallery.building, "name", locale)}`
              : `${t("photosOf")} ${localized(gallery.building, "name", locale)} · #${gallery.unit.number}`
          }
          images={
            gallery.kind === "buildings"
              ? gallery.building.images ?? []
              : gallery.unit.images ?? []
          }
        />
      )}

      {lightbox &&
        (() => {
          const imgs =
            lightbox.kind === "building" ? lightbox.building.images : lightbox.unit.images;
          const [activeImage, ...rest] = imgs;
          return (
            <div className="lightbox" onClick={() => setLightbox(null)}>
              <div className="lightbox-card" onClick={(e) => e.stopPropagation()}>
                <div className="lightbox-img">
                  {activeImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeImage.url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : lightbox.kind === "building" ? (
                    <BuildingArt
                      buildingId={lightbox.building.id}
                      meta={lightbox.meta}
                      cityLabel={
                        locale === "ar"
                          ? lightbox.building.city_ar ?? lightbox.building.city ?? ""
                          : lightbox.building.city_en ?? lightbox.building.city ?? ""
                      }
                      big
                    />
                  ) : (
                    <UnitArt
                      unitId={lightbox.unit.id}
                      unitType={lightbox.unit.unit_type}
                      meta={lightbox.meta}
                      typeLabel={typeLabel(lightbox.unit.unit_type)}
                    />
                  )}
                </div>
                {imgs.length > 0 && (
                  <div className="lightbox-strip">
                    {[activeImage, ...rest].slice(0, 6).map((img) => (
                      <div key={img.id} className="lightbox-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className="lightbox-close"
                  onClick={() => setLightbox(null)}
                  aria-label="Close"
                >
                  <span className="ms">close</span>
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
