/* Muktasbat — Drill-down: Owner → Building → Unit → Contract → Payment */

let allOwners = [];
let selectedOwnerId = null;
let expandedUnits = {};

const CSRF = document.querySelector('meta[name="csrf-token"]')?.content || '';

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function fmt(n) { return n != null ? Number(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'; }

function toast(msg, type) {
    type = type || 'success';
    let c = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function() { el.remove(); }, 4000);
}

/* ── Load data ────────────────────────────────────────────────────── */
async function loadData() {
    try {
        const [owners, stats] = await Promise.all([
            fetch('/api/owners').then(r => r.json()),
            fetch('/api/stats').then(r => r.json()),
        ]);
        allOwners = owners;
        renderStats(stats);
        renderOwnerList();
        if (selectedOwnerId) selectOwner(selectedOwnerId);
    } catch (e) {
        document.getElementById('ownerCards').innerHTML =
            '<div class="empty-state" style="color:var(--red-400)">Error: ' + esc(e.message) + '</div>';
    }
}

function renderStats(s) {
    /* Brand palette: maroon + grey + muted accents */
    var c1 = 'var(--brand-700)';
    var c2 = 'var(--grey-brand)';
    var c3 = 'var(--brand-500)';
    var c4 = '#8d6e63';
    var c5 = '#c9a227';
    document.getElementById('statsBar').innerHTML =
        '<div class="stat-chip"><span class="dot" style="background:' + c1 + '"></span> ' + I18N.owners + ' <strong>' + s.owners + '</strong></div>' +
        '<div class="stat-chip"><span class="dot" style="background:' + c2 + '"></span> ' + I18N.buildings + ' <strong>' + s.buildings + '</strong></div>' +
        '<div class="stat-chip"><span class="dot" style="background:' + c3 + '"></span> ' + I18N.units + ' <strong>' + s.units + '</strong></div>' +
        '<div class="stat-chip"><span class="dot" style="background:' + c4 + '"></span> ' + I18N.contracts + ' <strong>' + s.contracts + '</strong></div>' +
        '<div class="stat-chip"><span class="dot" style="background:' + c5 + '"></span> ' + I18N.payments + ' <strong>' + s.payments_pending + '</strong></div>';
}

/* ── Owner list ───────────────────────────────────────────────────── */
function renderOwnerList() {
    const search = (document.getElementById('ownerSearch').value || '').toLowerCase();
    const filtered = allOwners.filter(function(o) { return o.name.toLowerCase().includes(search); });
    if (!filtered.length) {
        document.getElementById('ownerCards').innerHTML =
            '<div class="empty-state">' + I18N.noMatch + '</div>';
        return;
    }
    document.getElementById('ownerCards').innerHTML = filtered.map(function(o) {
        return '<div class="owner-card' + (selectedOwnerId === o.id ? ' active' : '') + '" onclick="selectOwner(' + o.id + ')">' +
            '<div class="owner-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>' +
            '<div class="owner-info">' +
                '<div class="owner-name" title="' + esc(o.name) + '">' + esc(o.name) + '</div>' +
                '<div class="owner-meta"><strong>' + o.building_count + '</strong> ' + I18N.buildings + ' &middot; <strong>' + o.unit_count + '</strong> ' + I18N.units + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}
function filterOwners() { renderOwnerList(); }

/* ── Select owner → load detail ───────────────────────────────────── */
async function selectOwner(ownerId) {
    selectedOwnerId = ownerId;
    expandedUnits = {};
    renderOwnerList();
    document.getElementById('emptyState').style.display = 'none';
    var detail = document.getElementById('ownerDetail');
    detail.style.display = 'block';
    detail.innerHTML = '<div class="empty-state">' + I18N.loading + '</div>';
    document.getElementById('ownerList').classList.add('has-selection');
    try {
        var data = await fetch('/api/owners/' + ownerId).then(function(r) { return r.json(); });
        renderOwnerDetail(data.owner, data.buildings);
    } catch (e) {
        detail.innerHTML = '<div class="empty-state" style="color:var(--red-400)">Error: ' + esc(e.message) + '</div>';
    }
}

function goBack() {
    selectedOwnerId = null;
    document.getElementById('ownerList').classList.remove('has-selection');
    document.getElementById('ownerDetail').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    renderOwnerList();
}

/* ── Render owner detail ──────────────────────────────────────────── */
function renderOwnerDetail(owner, buildings) {
    var totalUnits = buildings.reduce(function(s, b) { return s + b.units.length; }, 0);
    var totalContracts = buildings.reduce(function(s, b) {
        return s + b.units.reduce(function(s2, u) { return s2 + u.contracts.length; }, 0);
    }, 0);

    var html = '<button class="back-btn" onclick="goBack()">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> ' +
        I18N.back + '</button>';

    html += '<div class="detail-header">' +
        '<div class="dh-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>' +
        '<div style="flex:1;min-width:0">' +
            '<h2>' + esc(owner.name) + '</h2>' +
            '<div class="dh-stats"><strong>' + buildings.length + '</strong> ' + I18N.buildings +
            ' &middot; <strong>' + totalUnits + '</strong> ' + I18N.units +
            ' &middot; <strong>' + totalContracts + '</strong> ' + I18N.contracts + '</div>' +
        '</div>' +
        '<div class="header-actions">' +
            '<a class="btn-add" href="/buildings/?new=1&owner_id=' + owner.id + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ' +
            I18N.addBuilding + '</a>' +
        '</div>' +
    '</div>';

    // Buildings accordion
    html += '<div class="accordion">';
    if (!buildings.length) {
        html += '<div class="empty-state">' + I18N.noBuildings + '</div>';
    }

    buildings.forEach(function(b) {
        var uc = b.units.length;
        var cc = b.units.reduce(function(s, u) { return s + u.contracts.length; }, 0);
        html += '<div class="accordion-item" id="bldg-' + b.id + '">' +
            '<div class="accordion-header" onclick="toggleAccordion(\'bldg-' + b.id + '\')">' +
                '<svg class="accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                '<span class="accordion-title">' + esc(b.name) + '</span>' +
                '<span class="accordion-subtitle">' + esc(b.city || '') + (b.district ? ' / ' + esc(b.district) : '') + '</span>' +
                '<div class="accordion-badges">' +
                    '<span class="acc-badge acc-badge-units">' + uc + ' ' + I18N.units + '</span>' +
                    '<span class="acc-badge acc-badge-contracts' + (cc === 0 ? ' zero' : '') + '">' + cc + ' ' + I18N.contracts + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="accordion-body">';

        // Units inside building
        html += '<div style="display:flex;align-items:center;gap:10px;margin-top:14px">' +
            '<p class="section-label" style="margin:0">' + I18N.units + '</p>' +
            '<a class="row-btn" href="/units/?new=1&building_id=' + b.id + '" style="opacity:1">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ' +
            I18N.addUnit + '</a></div>';

        if (b.units.length) {
            html += '<div class="unit-list">';
            b.units.forEach(function(u) {
                var statusClass = u.is_available ? 'badge-available' : 'badge-occupied';
                var statusText = u.is_available ? I18N.available : I18N.occupied;
                html += '<div>' +
                    '<div class="unit-row" onclick="toggleUnit(' + u.id + ')">' +
                        '<span class="unit-num">#' + esc(u.number) + '</span>' +
                        '<span class="unit-name">' + esc(u.name) + (u.unit_type ? ' (' + esc(u.unit_type) + ')' : '') + '</span>' +
                        '<span class="unit-rent">' + fmt(u.rent_amount) + ' ' + I18N.sar + '</span>' +
                        '<span class="unit-status ' + statusClass + '">' + statusText + '</span>' +
                        '<span class="acc-badge acc-badge-contracts' + (u.contracts.length === 0 ? ' zero' : '') + '">' + u.contracts.length + ' ' + I18N.contracts + '</span>' +
                    '</div>' +
                    '<div id="unit-detail-' + u.id + '" style="display:none">' + renderUnitDetail(u) + '</div>' +
                '</div>';
            });
            html += '</div>';
        } else {
            html += '<p class="empty-state">' + I18N.noUnits + '</p>';
        }

        html += '</div></div>';
    });

    html += '</div>';
    document.getElementById('ownerDetail').innerHTML = html;
}

/* ── Unit detail panel ────────────────────────────────────────────── */
function renderUnitDetail(u) {
    var html = '<div class="unit-detail-panel">';

    // Info grid
    html += '<div class="info-grid">';
    html += infoItem(I18N.mgmt, u.management_percentage + '%');
    if (u.agent_name) html += infoItem(I18N.agent, esc(u.agent_name) + ' (' + u.agent_percentage + '%)');
    html += infoItem(I18N.ejar, fmt(u.ejar_fee) + ' ' + I18N.sar);
    if (u.electric_invoice) html += infoItem(I18N.electric, esc(u.electric_invoice));
    if (u.water_invoice) html += infoItem(I18N.water, esc(u.water_invoice));
    html += '</div>';

    // Contracts
    html += '<div style="display:flex;align-items:center;gap:10px">' +
        '<p class="section-label" style="margin:0">' + I18N.contracts + '</p>';
    if (u.is_available) {
        html += '<a class="row-btn" href="/contracts/?new=1&unit_id=' + u.id + '" style="opacity:1">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ' +
            I18N.newContract + '</a>';
    }
    html += '</div>';

    if (u.contracts.length) {
        u.contracts.forEach(function(c) {
            var statusClass = 'badge-' + c.status;
            var statusLabel = I18N[c.status] || c.status;

            html += '<div style="margin-top:10px;padding:14px;background:var(--bg-input);border:1px solid var(--border-td);border-radius:10px">';
            html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
                '<span class="mono" style="font-weight:700;color:var(--teal-500)">' + esc(c.contract_number) + '</span>' +
                '<span style="color:var(--text-primary);font-weight:600">' + esc(c.tenant_name) + '</span>' +
                '<span style="color:var(--text-muted);font-size:0.78rem">' + c.start_date + ' → ' + c.end_date + '</span>' +
                '<span class="badge ' + statusClass + '">' + statusLabel + '</span>' +
                '<span style="margin-left:auto;font-family:var(--font-metric);font-weight:700;color:var(--text-primary)">' + fmt(c.rent_amount) + ' ' + I18N.sar + '/mo</span>' +
            '</div>';

            // Contract info chips
            html += '<div class="info-grid" style="margin-bottom:10px">' +
                infoItem(I18N.paymentCycle, c.payment_cycle + ' ' + I18N.months) +
                infoItem(I18N.mgmt + ' fee', fmt(c.management_fee) + ' ' + I18N.sar) +
                infoItem(I18N.agent + ' fee', fmt(c.agent_fee) + ' ' + I18N.sar) +
                infoItem(I18N.tenant + ' ' + I18N.phone, esc(c.tenant_phone)) +
                infoItem(I18N.nationalId, esc(c.tenant_national_id)) +
            '</div>';

            // Payments
            html += '<p class="section-label">' + I18N.payments + '</p>';
            if (c.payments.length) {
                html += '<div class="payment-list">';
                c.payments.forEach(function(p, i) {
                    var pStatusClass = 'badge-' + p.status;
                    var pStatusLabel = I18N[p.status] || p.status;
                    html += '<div class="payment-row">' +
                        '<span class="p-date">#' + (i + 1) + ' &middot; ' + p.due_date + '</span>' +
                        '<span class="p-amount">' + fmt(p.amount) + ' ' + I18N.sar + '</span>' +
                        '<span class="badge ' + pStatusClass + '">' + pStatusLabel + '</span>' +
                        (p.status === 'pending'
                            ? '<form method="POST" action="/payments/' + p.id + '/pay" style="display:inline"><input type="hidden" name="csrf_token" value="' + CSRF + '"><button class="row-btn" style="opacity:1" type="submit">' + I18N.pay + '</button></form>'
                            : '<span class="p-date">' + (p.paid_date || '') + '</span>') +
                    '</div>';
                });
                html += '</div>';
            } else {
                html += '<p class="empty-state" style="padding:8px 0">' + I18N.noPayments + '</p>';
            }

            html += '</div>';
        });
    } else {
        html += '<p class="empty-state" style="padding:8px 0">' + I18N.noContracts + '</p>';
    }

    html += '</div>';
    return html;
}

function infoItem(label, value) {
    return '<div class="info-item"><div class="info-label">' + label + '</div><div class="info-value">' + value + '</div></div>';
}

/* ── Toggle helpers ───────────────────────────────────────────────── */
function toggleAccordion(id) {
    document.getElementById(id).classList.toggle('open');
}

function toggleUnit(unitId) {
    var el = document.getElementById('unit-detail-' + unitId);
    if (el.style.display === 'none') {
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

/* ── Init ─────────────────────────────────────────────────────────── */
loadData();
