import { getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { formatPercent, formatSAR } from "@/lib/format";

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

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("dashboard");
  const tCurrency = await getTranslations("currency");
  const me = await requireAuth(locale);

  let portfolio: Portfolio | null = null;
  let trends: RevenueTrends | null = null;
  let loadError: string | null = null;
  try {
    [portfolio, trends] = await Promise.all([
      api.get<Portfolio>("/api/v1/analytics/portfolio"),
      api.get<RevenueTrends>("/api/v1/analytics/revenue-trends"),
    ]);
  } catch (err) {
    if (err instanceof ApiError) loadError = `${err.status}: ${err.message}`;
    else throw err;
  }

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
          <div className="kpi-grid">
            <KpiCard
              icon="payments"
              label={t("collectedMtd")}
              value={`${tCurrency("sar")} ${formatSAR(portfolio.revenue.total_collected, locale)}`}
              progress={portfolio.revenue.collection_rate}
            />
            <KpiCard
              icon="schedule"
              label={t("totalPending")}
              value={`${tCurrency("sar")} ${formatSAR(portfolio.revenue.total_pending, locale)}`}
            />
            <KpiCard
              icon="warning"
              label={t("overduePayments")}
              value={`${tCurrency("sar")} ${formatSAR(portfolio.revenue.total_overdue, locale)}`}
              variant="danger"
            />
            <KpiCard
              icon="trending_up"
              label={t("collectionRate")}
              value={formatPercent(portfolio.revenue.collection_rate, locale)}
              variant="success"
              progress={portfolio.revenue.collection_rate}
            />
            <KpiCard
              icon="domain"
              label={t("buildings")}
              value={String(portfolio.portfolio.buildings)}
            />
            <KpiCard
              icon="meeting_room"
              label={`${t("occupied")} / ${t("units")}`}
              value={`${portfolio.portfolio.occupied_units} / ${portfolio.portfolio.total_units}`}
              progress={
                portfolio.portfolio.total_units
                  ? (portfolio.portfolio.occupied_units / portfolio.portfolio.total_units) * 100
                  : 0
              }
            />
            <KpiCard
              icon="description"
              label={t("activeContracts")}
              value={String(portfolio.portfolio.active_contracts)}
            />
            <KpiCard
              icon="account_balance"
              label={t("mgmtFeeIncome")}
              value={`${tCurrency("sar")} ${formatSAR(portfolio.company_income.management_fees, locale)}`}
              variant="success"
            />
          </div>
        )}

        {trends && (
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-hd">
              <h3>{t("revenueTrend")}</h3>
            </div>
            <div className="card-body" style={{ height: 320 }}>
              <RevenueTrendChart
                data={trends.months}
                labels={{ collected: t("collected"), expected: t("expected") }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  variant,
  progress,
}: {
  icon: string;
  label: string;
  value: string;
  variant?: "success" | "warning" | "danger";
  progress?: number;
}) {
  return (
    <div className={"kpi" + (variant ? ` ${variant}` : "")}>
      <div className="kpi-head">
        <div className="kpi-icon">
          <span className="ms">{icon}</span>
        </div>
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {progress != null && (
        <div className="kpi-bar">
          <span style={{ width: Math.min(100, Math.max(0, progress)) + "%" }} />
        </div>
      )}
    </div>
  );
}
