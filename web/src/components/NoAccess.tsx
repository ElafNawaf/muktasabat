import { Topbar } from "./Topbar";

/** Shown instead of a page the user's role can't open. */
export function NoAccess({ locale, title, user }: { locale: string; title: string; user: { username: string; role: string } }) {
  const ar = locale === "ar";
  return (
    <>
      <Topbar title={title} user={user} />
      <div className="page screen-enter">
        <div className="empty-state">
          <div className="empty-icon"><span className="ms">lock</span></div>
          <div className="empty-title">{ar ? "ليست لديك صلاحية لهذه الصفحة" : "You don't have access to this page"}</div>
          <div className="empty-sub">
            {ar
              ? "صلاحيات دورك لا تشمل هذا القسم. إذا كنت تحتاجه في عملك، اطلب من مدير النظام تعديل صلاحيات دورك من «إدارة المستخدمين ← الأدوار والصلاحيات»."
              : "Your role doesn't include this section. If you need it, ask an administrator to update your role under User management → Roles & permissions."}
          </div>
          <a className="btn btn-secondary" href={`/${locale}/account`} style={{ marginTop: 8 }}>
            {ar ? "حسابي" : "My account"}
          </a>
        </div>
      </div>
    </>
  );
}
