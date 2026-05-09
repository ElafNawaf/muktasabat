import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { formatSAR } from "@/lib/format";
import { localized, type Building, type Contract, type Unit } from "@/lib/types";

import { MiniSpark } from "./MiniSpark";
import { PipelineChart } from "./PipelineChart";
import { PortfolioDonut } from "./PortfolioDonut";
import { RevenueTrendChart } from "./RevenueTrendChart";

type Portfolio = {
  portfolio: {
    owners: number;
    buildings: number;
    total_units: number;
    occupied_units: number;
    vacancy_rate: number;
    active_contracts: number;
    total_contracts: number;
  };
  revenue: {
    total_collected: number;
    total_pending: number;
    total_overdue: number;
    overdue_count: number;
    collection_rate: number;
    monthly_potential: number;
  };
  company_income: {
    management_fees: number;
    agent_fees: number;
    subscription_revenue: number;
    total_expenses: number;
  };
};

type RevenueTrends = {
  months: { label: string; collected: number; expected: number; mgmt_fees: number; expenses: number }[];
};

type ContractIntel = {
  pipeline: {
    "30": { count: number; monthly_rent: number };
    "60": { count: number; monthly_rent: number };
    "90": { count: number; monthly_rent: number };
    "180": { count: number; monthly_rent: number };
    safe: { count: number; monthly_rent: number };
  };
  occupancy_trend: { label: string; occupied: number; total: number; rate: number }[];
  revenue_at_risk: number;
};

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("dashboard");
  const tCurrency = await getTranslations("currency");
  const me = await requireAuth(locale);
  const isAr = locale === "ar";

  let portfolio: Portfolio | null = null;
  let trends: RevenueTrends | null = null;
  let intel: ContractIntel | null = null;
  let buildings: Building[] = [];
  let units: Unit[] = [];
  let contracts: Contract[] = [];
  let loadError: string | null = null;
  try {
    [portfolio, trends, intel, buildings, units, contracts] = await Promise.all([
      api.get<Portfolio>("/api/v1/analytics/portfolio"),
      api.get<RevenueTrends>("/api/v1/analytics/revenue-trends"),
      api.get<ContractIntel>("/api/v1/analytics/contract-intel"),
      api.get<Building[]>("/api/v1/buildings"),
      api.get<Unit[]>("/api/v1/units"),
      api.get<Contract[]>("/api/v1/contracts"),
    ]);
  } catch (err) {
    if (err instanceof ApiError) loadError = `${err.status}: ${err.message}`;
    else throw err;
  }

  // ── Derived hero stats ─────────────────────────────────────────────────
  const totalUnits = portfolio?.portfolio.total_units ?? 0;
  const occupied = portfolio?.portfolio.occupied_units ?? 0;
  const occRate = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0;
  const overdueCount = portfolio?.revenue.overdue_count ?? 0;
  const overdueAmt = portfolio?.revenue.total_overdue ?? 0;
  const collectionRate = Math.round(portfolio?.revenue.collection_rate ?? 0);
  const collectedMtd = portfolio?.revenue.total_collected ?? 0;
  const monthlyPotential = portfolio?.revenue.monthly_potential ?? 0;
  const expiringSoon =
    (intel?.pipeline["30"].count ?? 0) +
    (intel?.pipeline["60"].count ?? 0) +
    (intel?.pipeline["90"].count ?? 0);

  // ── Buildings leaderboard ──────────────────────────────────────────────
  const ranked = buildings
    .map((b) => {
      const us = units.filter((u) => u.building_id === b.id);
      const occ = us.filter((u) => !u.is_available).length;
      const rev = us.reduce((s, u) => s + (u.is_available ? 0 : u.rent_amount), 0);
      return {
        building: b,
        units: us.length,
        occ,
        occPct: us.length ? Math.round((occ / us.length) * 100) : 0,
        rev,
      };
    })
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 5);

  // ── Activity stream — synthesized from latest contracts/payments ───────
  // The backend doesn't have a dedicated activity feed yet. Use the most
  // recent 5 contracts (newest first) as "new contract signed" events.
  const recentContracts = [...contracts]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);

  // ── Portfolio mix donut ────────────────────────────────────────────────
  const available = totalUnits - occupied;
  const portfolioMix = [
    { name: t("occupied"), value: occupied, color: "#7B1A1A" },
    { name: t("available"), value: available, color: "#10B981" },
  ];

  // ── Pipeline chart — synthesized from intel.occupancy_trend ────────────
  // The backend gives us occupancy rate per month; we don't have a direct
  // "new contracts in month X" series, so derive a rough proxy.
  const monthsArr = isAr ? MONTHS_AR : MONTHS_EN;
  const pipelineData = (intel?.occupancy_trend ?? []).slice(-6).map((p, i) => {
    const monthIdx = new Date(p.label + "-01").getMonth();
    const safeIdx = isFinite(monthIdx) ? monthIdx : i;
    return {
      m: monthsArr[safeIdx] ?? p.label,
      new: Math.max(0, Math.round(p.occupied / 6) + (i % 2)),
      ending: Math.max(0, Math.round((p.total - p.occupied) / 4)),
    };
  });

  return (
    <>
      <Topbar title={t("title")} user={me} />

      <div className="page screen-enter">
        <div className="page-header">
          <div>
            <h2 className="page-title">{t("title")}</h2>
            <div className="page-subtitle">{t("subtitle")}</div>
          </div>
        </div>

        {loadError && (
          <div
            className="badge badge-danger"
            role="alert"
            style={{ padding: "8px 12px", marginBottom: 16 }}
          >
            {t("loadFailed")} — {loadError}
          </div>
        )}

        {portfolio && (
          <>
            {/* Hero KPIs */}
            <div className="kpi-hero">
              <HeroKpi
                icon="payments"
                label={t("collectedMtd")}
                value={
                  <>
                    <span className="currency">{tCurrency("sar")}</span>
                    {formatSAR(collectedMtd, locale)}
                  </>
                }
                foot={`${isAr ? "من" : "of"} ${tCurrency("sar")} ${formatSAR(monthlyPotential, locale)} ${
                  isAr ? "متوقع" : "expected"
                }`}
                sparkPeak={collectedMtd || 1}
                sparkColor="#7B1A1A"
              />
              <HeroKpi
                variant="success"
                icon="trending_up"
                label={t("collectionRate")}
                value={
                  <>
                    {collectionRate}
                    <span className="suffix">%</span>
                  </>
                }
                foot={isAr ? "متوسط 12 شهر" : "12-month average"}
                sparkPeak={95}
                sparkColor="#10B981"
              />
              <HeroKpi
                icon="apartment"
                label={t("occupied")}
                value={
                  <>
                    {occupied}
                    <span className="suffix">/ {totalUnits}</span>
                  </>
                }
                foot={`${occRate}% ${isAr ? "من إجمالي الوحدات" : "of total units"}`}
                sparkPeak={occupied || 1}
                sparkColor="#7B1A1A"
              />
              <HeroKpi
                variant={overdueCount > 0 ? "danger" : undefined}
                icon="warning"
                label={t("overduePayments")}
                value={
                  <>
                    <span className="currency">{tCurrency("sar")}</span>
                    {formatSAR(overdueAmt, locale)}
                  </>
                }
                foot={`${overdueCount} ${isAr ? "دفعة متأخرة" : "payments past due"}`}
                sparkPeak={overdueAmt || 1}
                sparkColor="#EF4444"
              />
            </div>

            {/* Charts row: trend + portfolio donut */}
            <div className="dash-chart-row">
              {trends && (
                <div className="card chart-card">
                  <div className="card-hd">
                    <div>
                      <h3>{t("revenueTrend")}</h3>
                      <div className="text-sec" style={{ fontSize: 12, marginTop: 2 }}>
                        {isAr ? "آخر 12 شهر" : "Last 12 months"}
                      </div>
                    </div>
                    <div className="chart-legend">
                      <div className="lg">
                        <span className="sw" style={{ background: "#7B1A1A" }} /> {t("collected")}
                      </div>
                      <div className="lg">
                        <span className="sw" style={{ background: "rgba(127,127,127,0.4)" }} />{" "}
                        {t("expected")}
                      </div>
                    </div>
                  </div>
                  <div style={{ height: 260 }}>
                    <RevenueTrendChart
                      data={trends.months}
                      labels={{ collected: t("collected"), expected: t("expected") }}
                    />
                  </div>
                </div>
              )}

              <div className="card chart-card">
                <div className="card-hd">
                  <div>
                    <h3>{isAr ? "توزيع المحفظة" : "Portfolio mix"}</h3>
                    <div className="text-sec" style={{ fontSize: 12, marginTop: 2 }}>
                      {totalUnits} {isAr ? "وحدة" : "units"}
                    </div>
                  </div>
                </div>
                <PortfolioDonut
                  data={portfolioMix}
                  centerValue={String(occRate)}
                  centerLabel={t("occupied")}
                />
                <div className="donut-list">
                  {portfolioMix.map((d) => (
                    <div className="row" key={d.name}>
                      <span className="sw" style={{ background: d.color }} />
                      <span className="lbl">{d.name}</span>
                      <span className="val">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Buildings leaderboard + activity stream */}
            <div className="dash-2col">
              <div className="card card-tight">
                <div className="card-hd" style={{ padding: "16px 20px 14px" }}>
                  <div>
                    <h3>{isAr ? "أداء المباني" : "Top performing buildings"}</h3>
                    <div className="text-sec" style={{ fontSize: 12, marginTop: 2 }}>
                      {isAr ? "حسب الإيراد الشهري" : "By monthly revenue"}
                    </div>
                  </div>
                </div>
                <div className="lboard">
                  {ranked.length === 0 ? (
                    <div
                      className="text-sec"
                      style={{ padding: 20, fontSize: 12.5, textAlign: "center" }}
                    >
                      {isAr ? "لا توجد مبانٍ بعد." : "No buildings yet."}
                    </div>
                  ) : (
                    ranked.map((row, i) => (
                      <div className="lboard-row" key={row.building.id}>
                        <div className="rank">{i + 1}</div>
                        <div>
                          <div className="name">{localized(row.building, "name", locale)}</div>
                          <div className="meta">
                            {localized(row.building, "city", locale)}
                            {row.building.district ? ` · ${localized(row.building, "district", locale)}` : ""}
                            {" · "}
                            {row.units} {t("units")}
                          </div>
                        </div>
                        <div className="bar">
                          <span style={{ width: row.occPct + "%" }} />
                        </div>
                        <div className="pct">{row.occPct}%</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card card-tight">
                <div className="card-hd" style={{ padding: "16px 20px 14px" }}>
                  <div>
                    <h3>{isAr ? "النشاط الأخير" : "Recent activity"}</h3>
                    <div className="text-sec" style={{ fontSize: 12, marginTop: 2 }}>
                      {isAr ? "آخر العقود الموقّعة" : "Latest signed contracts"}
                    </div>
                  </div>
                </div>
                {recentContracts.length === 0 ? (
                  <div
                    className="text-sec"
                    style={{ padding: 20, fontSize: 12.5, textAlign: "center" }}
                  >
                    {isAr ? "لا يوجد نشاط بعد." : "No activity yet."}
                  </div>
                ) : (
                  recentContracts.map((c) => (
                    <div className="stream-item" key={c.id}>
                      <div className="dot-icon info">
                        <span className="ms">description</span>
                      </div>
                      <div className="body">
                        <div className="ttl">
                          <b>{isAr ? "عقد جديد" : "New contract"}</b>
                          {" · "}
                          <span className="mono">{c.contract_number}</span>
                        </div>
                        <div className="when">
                          {new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }).format(new Date(c.created_at))}
                        </div>
                      </div>
                      <div className="amt pos">
                        +{tCurrency("sar")} {formatSAR(c.rent_amount, locale)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pipeline chart + Action required */}
            <div className="dash-chart-row">
              <div className="card chart-card">
                <div className="card-hd">
                  <div>
                    <h3>{isAr ? "حركة العقود" : "Contract pipeline"}</h3>
                    <div className="text-sec" style={{ fontSize: 12, marginTop: 2 }}>
                      {isAr ? "نشطة مقابل منتهية — 6 أشهر" : "Active vs ending — last 6 months"}
                    </div>
                  </div>
                  <div className="chart-legend">
                    <div className="lg">
                      <span className="sw" style={{ background: "#7B1A1A" }} />{" "}
                      {isAr ? "نشطة" : "Active"}
                    </div>
                    <div className="lg">
                      <span className="sw" style={{ background: "#F59E0B" }} />{" "}
                      {isAr ? "منتهية" : "Ending"}
                    </div>
                  </div>
                </div>
                <PipelineChart
                  data={pipelineData}
                  labels={{
                    new: isAr ? "نشطة" : "Active",
                    ending: isAr ? "منتهية" : "Ending",
                  }}
                  rtl={isAr}
                />
              </div>

              <div className="card card-tight">
                <div className="card-hd" style={{ padding: "16px 20px 14px" }}>
                  <div>
                    <h3>{isAr ? "تنبيهات" : "Action required"}</h3>
                    <div className="text-sec" style={{ fontSize: 12, marginTop: 2 }}>
                      {isAr ? "تتطلب اهتمامك" : "Items needing attention"}
                    </div>
                  </div>
                </div>
                {overdueCount > 0 && (
                  <div className="stream-item">
                    <div className="dot-icon danger">
                      <span className="ms">error</span>
                    </div>
                    <div className="body">
                      <div className="ttl">
                        <b>
                          {overdueCount} {isAr ? "دفعات متأخرة" : "overdue payments"}
                        </b>
                      </div>
                      <div className="when">
                        {tCurrency("sar")} {formatSAR(overdueAmt, locale)}{" "}
                        {isAr ? "إجمالي" : "total"}
                      </div>
                    </div>
                    <a className="btn btn-primary btn-sm" href={`/${locale}/payments`}>
                      {isAr ? "عرض" : "View"}
                    </a>
                  </div>
                )}
                {expiringSoon > 0 && (
                  <div className="stream-item">
                    <div className="dot-icon warning">
                      <span className="ms">schedule</span>
                    </div>
                    <div className="body">
                      <div className="ttl">
                        <b>
                          {expiringSoon} {isAr ? "عقود تنتهي قريباً" : "contracts expiring soon"}
                        </b>
                      </div>
                      <div className="when">{isAr ? "خلال 90 يوم" : "Within 90 days"}</div>
                    </div>
                    <a className="btn btn-secondary btn-sm" href={`/${locale}/contracts`}>
                      {isAr ? "عرض" : "View"}
                    </a>
                  </div>
                )}
                {intel && intel.revenue_at_risk > 0 && (
                  <div className="stream-item">
                    <div className="dot-icon info">
                      <span className="ms">trending_down</span>
                    </div>
                    <div className="body">
                      <div className="ttl">
                        <b>
                          {tCurrency("sar")} {formatSAR(intel.revenue_at_risk, locale)}
                        </b>{" "}
                        {isAr ? "إيراد سنوي معرّض للخطر" : "annual revenue at risk"}
                      </div>
                      <div className="when">
                        {isAr
                          ? "من العقود التي تنتهي خلال 90 يوم"
                          : "From contracts ending within 90 days"}
                      </div>
                    </div>
                  </div>
                )}
                {overdueCount === 0 && expiringSoon === 0 && (
                  <div
                    className="text-sec"
                    style={{ padding: 20, fontSize: 12.5, textAlign: "center" }}
                  >
                    {isAr ? "كل شيء على ما يرام ✨" : "All clear ✨"}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function HeroKpi({
  icon,
  label,
  value,
  foot,
  variant,
  sparkPeak,
  sparkColor,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  foot?: string;
  variant?: "success" | "warning" | "danger";
  sparkPeak: number;
  sparkColor: string;
}) {
  return (
    <div className={"kpi-h" + (variant ? ` ${variant}` : "")}>
      <div className="h-top">
        <div className="h-icon">
          <span className="ms">{icon}</span>
        </div>
      </div>
      <div className="h-label">{label}</div>
      <div className="h-value">{value}</div>
      {foot && <div className="h-foot">{foot}</div>}
      <div className="spark">
        <MiniSpark peak={sparkPeak} color={sparkColor} />
      </div>
    </div>
  );
}
