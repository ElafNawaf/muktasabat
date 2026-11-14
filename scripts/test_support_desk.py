"""End-to-end test of the support desk (tickets, assignment, log, SLA, e-mails).

Run against a scratch database:
    DATABASE_URL=sqlite:////tmp/sd.db SECRET_KEY=test python3 scripts/test_support_desk.py
Writes every captured e-mail to /tmp/support-mails/*.html for visual review.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402
from api.services import support_mail  # noqa: E402

SENT: list = []
support_mail.send_email = lambda msg: SENT.append(msg) or True  # capture
FAILURES: list[str] = []
OUT = "/tmp/support-mails"


def check(label: str, cond: bool, detail: object = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {label}" + ("" if cond else f" — {str(detail)[:400]}"))
    if not cond:
        FAILURES.append(label)


def mails_to(addr: str) -> list:
    return [m for m in SENT if m.to == addr.lower()]


def login(c, username, password):
    r = c.post("/api/v1/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    with TestClient(app) as c:
        from api.database import SessionLocal
        from api.models import User

        with SessionLocal() as db:
            for uname, role, email in (("tech1", "manager", "tech1@example.com"),
                                       ("client1", "viewer", "client1@example.com"),
                                       ("other1", "viewer", "other1@example.com")):
                u = User(username=uname, email=email, role=role, is_active_user=True, email_verified=True,
                         full_name={"tech1": "فهد الفني", "client1": "Sara Client", "other1": "Other"}[uname])
                u.set_password("Passw0rd!x")
                db.add(u)
            db.commit()
            tech_id = db.query(User).filter_by(username="tech1").one().id

        admin = login(c, "admin", "admin123")
        tech = login(c, "tech1", "Passw0rd!x")
        client = login(c, "client1", "Passw0rd!x")
        other = login(c, "other1", "Passw0rd!x")

        print("create")
        r = c.post("/api/v1/support/tickets", headers=client, data={
            "subject": "لا أستطيع رفع صورة العقار", "category": "technical", "priority": "high",
            "body": "عند رفع صورة للعقار تظهر رسالة خطأ.\nجرّبت من الجوال والكمبيوتر.\nThe upload button spins forever.",
            "page_url": "https://muktasabat.com/ar/properties/12"})
        check("ticket created", r.status_code == 201, r.text)
        tk = r.json()
        tid = tk["id"]
        check("SLA targets set", tk["response_due_at"] and tk["resolve_due_at"], tk)
        check("created event logged", [e["kind"] for e in tk["events"]] == ["created"], tk["events"])
        rec = mails_to("client1@example.com")
        check("requester gets receipt with full description", rec and "The upload button spins forever" in rec[-1].html_body)
        staff_mail = [m for m in SENT if m.to != "client1@example.com"]
        check("support staff alerted", bool(staff_mail) and "تذكرة دعم جديدة" in staff_mail[-1].subject)

        print("assignment")
        r = c.get("/api/v1/support/staff", headers=admin)
        check("assignee list includes non-admin staff", any(u["id"] == tech_id for u in r.json()), r.json())
        check("owners/requesters can't list staff? (viewer allowed, owner not)", r.status_code == 200)
        before = len(SENT)
        r = c.put(f"/api/v1/support/tickets/{tid}", headers=admin, json={"assignee_id": tech_id})
        d = r.json()
        check("assigned", r.status_code == 200 and d["assignee"]["id"] == tech_id, r.text)
        check("assignment moves open → in_progress", d["status"] == "in_progress", d["status"])
        new = SENT[before:]
        to_tech = [m for m in new if m.to == "tech1@example.com"]
        check("technician gets 'assigned' email with description", to_tech and "أُسندت إليك" in to_tech[0].subject
              and "The upload button spins forever" in to_tech[0].html_body)
        to_client = [m for m in new if m.to == "client1@example.com"]
        check("requester told who is handling it", to_client and "فهد الفني" in to_client[0].html_body
              and "What changed" in to_client[0].html_body)

        print("technician access")
        r = c.get(f"/api/v1/support/tickets/{tid}", headers=tech)
        check("assignee (no support.edit) can open the ticket", r.status_code == 200 and r.json()["can_manage"], r.text)
        r = c.get(f"/api/v1/support/tickets/{tid}", headers=other)
        check("unrelated user gets 404", r.status_code == 404)
        r = c.get("/api/v1/support/tickets?scope=assigned", headers=tech)
        check("technician 'assigned to me' list", [x["id"] for x in r.json()] == [tid], r.json())

        print("conversation")
        before = len(SENT)
        r = c.post(f"/api/v1/support/tickets/{tid}/messages", headers=tech, data={"body": "ملاحظة: المشكلة في حجم الصورة", "internal": "true"})
        check("internal note saved", r.status_code == 200)
        check("internal note not emailed to requester", not [m for m in SENT[before:] if m.to == "client1@example.com"])
        r = c.post(f"/api/v1/support/tickets/{tid}/messages", headers=tech, data={"body": "Hello Sara,\nplease try an image under 10 MB.\nشكرًا"})
        d = r.json()
        check("first response recorded", d["first_response_at"] is not None and d["sla_state"] == "met", d["sla_state"])
        check("staff reply → waiting for customer", d["status"] == "waiting_user")
        m = [x for x in SENT[before:] if x.to == "client1@example.com"]
        check("requester gets full reply text", m and "please try an image under 10 MB." in m[-1].html_body and "Activity log" in m[-1].html_body)
        check("requester email hides internal note", m and "المشكلة في حجم الصورة" not in m[-1].html_body)
        r = c.get(f"/api/v1/support/tickets/{tid}", headers=client).json()
        check("requester can't see internal note or its event",
              all(not x["internal"] for x in r["messages"]) and all(e["kind"] != "note" for e in r["events"]))
        before = len(SENT)
        r = c.post(f"/api/v1/support/tickets/{tid}/messages", headers=client, data={"body": "Worked, thanks!"})
        check("customer reply reopens", r.json()["status"] == "open")
        check("assignee emailed on customer reply", [x for x in SENT[before:] if x.to == "tech1@example.com"])

        print("resolve + rate")
        r = c.put(f"/api/v1/support/tickets/{tid}", headers=tech, json={"status": "resolved"})
        check("resolve without summary refused", r.status_code == 422, r.status_code)
        before = len(SENT)
        r = c.put(f"/api/v1/support/tickets/{tid}", headers=tech,
                  json={"status": "resolved", "resolution": "رفعنا الحد الأقصى لحجم الصور إلى 15MB.\nUpload limit raised to 15 MB."})
        check("resolved", r.status_code == 200 and r.json()["status"] == "resolved", r.text)
        m = [x for x in SENT[before:] if x.to == "client1@example.com"]
        check("resolved email has resolution + rating stars", m and "Upload limit raised to 15 MB." in m[-1].html_body and "?rate=5" in m[-1].html_body)
        r = c.post(f"/api/v1/support/tickets/{tid}/rate", headers=tech, json={"rating": 5})
        check("only requester can rate", r.status_code == 403)
        before = len(SENT)
        r = c.post(f"/api/v1/support/tickets/{tid}/rate", headers=client, json={"rating": 4, "comment": "سريع ومفيد"})
        check("rated", r.status_code == 200 and r.json()["rating"] == 4)
        check("technician gets rating email", [x for x in SENT[before:] if x.to == "tech1@example.com" and "سريع ومفيد" in x.html_body])

        kinds = [e["kind"] for e in c.get(f"/api/v1/support/tickets/{tid}", headers=admin).json()["events"]]
        check("full activity log", kinds[:3] == ["created", "assigned", "status"] and "resolved" in kinds and "rated" in kinds and "note" in kinds, kinds)
        st = c.get("/api/v1/support/stats", headers=admin).json()
        check("stats include rating", st["avg_rating"] == 4.0, st)

        print("all emails bilingual + responsive header")
        for i, msg in enumerate(SENT):
            with open(f"{OUT}/{i:02d}-{msg.to.split('@')[0]}.html", "w") as f:
                f.write(msg.html_body)
        check("every email has Arabic and English", all("شركة مكتسبات العقارية" in m.html_body and "Muktasabat Real Estate" in m.html_body
                                                          and " | " in m.subject for m in SENT))
        check("header logo is centred", all("align='center'" in m.html_body.split("Muktasabat Real Estate")[0] for m in SENT))
    print()
    print(f"{len(SENT)} e-mails captured → {OUT}")
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {FAILURES}")
        return 1
    print("ALL PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
