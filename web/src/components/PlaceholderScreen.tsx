import { getLocale, getTranslations } from "next-intl/server";

import { Topbar } from "@/components/Topbar";
import { requireAuth } from "@/lib/auth";

/**
 * Placeholder for screens not yet ported from the prototype.
 * Renders the shell topbar + an "empty" panel with the screen title and message.
 */
export async function PlaceholderScreen({
  screenKey,
}: {
  screenKey: "properties" | "contracts" | "payments" | "owners" | "tenants" | "expenses" | "users";
}) {
  const locale = await getLocale();
  const me = await requireAuth(locale);
  const t = await getTranslations(`screens.${screenKey}`);
  const tCommon = await getTranslations("common");

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

        <div
          style={{
            padding: 60,
            textAlign: "center",
            color: "var(--color-text-secondary)",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            marginTop: 24,
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
            <span className="ms ms-lg">construction</span>
          </div>
          <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: 16 }}>
            {tCommon("comingSoon")}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{t("subtitle")}</div>
        </div>
      </div>
    </>
  );
}
