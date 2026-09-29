"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";

const NAVY = "#1a4480";
const WHITE = "#ffffff";
const MUTED = "#5b6474";
const BORDER = "#dbe2ec";
const TEXT = "#0f172a";
const GREEN = "#15803d";
const RED = "#b91c1c";
const AMBER = "#b45309";

const TABLES = ["calloff_submissions", "dar_submissions", "time_off_requests", "disciplinary_records"] as const;

interface PendingCallOff { id: string; officer_name: string; shift_date: string; shift_start: string; notice_type: string; reason: string; document_url: string | null; }
interface PendingTimeOff { id: string; officer_name: string; absence_type: string; dates_requested: string; }
interface UnsignedNotice { id: string; officer_name: string; action_type: string | null; infraction: string | null; }
interface UnmatchedName { key: string; display: string; refs: { table: string; id: string }[]; }
interface Officer { id: string; full_name: string; }

// Same rule as the database's normalize_name(): trim, collapse spaces, lowercase.
const normalize = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();

const formatDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${m}/${d}/${y}`;
};

export default function NeedsAttention({ onChange }: { onChange?: () => void }) {
  const [callOffs, setCallOffs] = useState<PendingCallOff[]>([]);
  const [timeOff, setTimeOff] = useState<PendingTimeOff[]>([]);
  const [notices, setNotices] = useState<UnsignedNotice[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedName[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [co, to, dr, off, ...unlinked] = await Promise.all([
      supabase.from("calloff_submissions").select("id, officer_name, shift_date, shift_start, notice_type, reason, document_url").or("excusal_status.is.null,excusal_status.eq.pending").order("submitted_at", { ascending: false }).limit(8),
      supabase.from("time_off_requests").select("id, officer_name, absence_type, dates_requested").eq("status", "pending").order("submitted_at", { ascending: false }).limit(5),
      supabase.from("disciplinary_records").select("id, officer_name, action_type, infraction").is("signature", null).order("submitted_at", { ascending: false }).limit(5),
      supabase.from("officers").select("id, full_name").order("full_name"),
      ...TABLES.map((t) => supabase.from(t).select("id, officer_name").is("officer_id", null).limit(50)),
    ]);
    setCallOffs((co.data as PendingCallOff[]) || []);
    setTimeOff((to.data as PendingTimeOff[]) || []);
    setNotices((dr.data as UnsignedNotice[]) || []);
    setOfficers((off.data as Officer[]) || []);

    const groups = new Map<string, UnmatchedName>();
    unlinked.forEach((res, i) => {
      for (const row of (res.data as { id: string; officer_name: string | null }[]) || []) {
        if (!row.officer_name?.trim()) continue;
        const key = normalize(row.officer_name);
        const g = groups.get(key) || { key, display: row.officer_name.trim().replace(/\s+/g, " "), refs: [] };
        g.refs.push({ table: TABLES[i], id: row.id });
        groups.set(key, g);
      }
    });
    setUnmatched(Array.from(groups.values()).sort((a, b) => b.refs.length - a.refs.length));
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setExcusal = async (id: string, status: "excused" | "unexcused") => {
    setBusy(id);
    const { error } = await getSupabase().from("calloff_submissions").update({ excusal_status: status }).eq("id", id);
    if (!error) setCallOffs((prev) => prev.filter((c) => c.id !== id));
    setBusy(null);
    onChange?.();
  };

  // Remember this spelling for the chosen officer (or a new one) and link the records.
  const matchName = async (name: UnmatchedName, choice: string) => {
    if (!choice) return;
    setBusy(name.key);
    const supabase = getSupabase();
    let officerId = choice;
    if (choice === "__new__") {
      const { data, error } = await supabase.from("officers").insert([{ full_name: name.display }]).select("id").single();
      if (error || !data) { setBusy(null); alert("Couldn't add the officer. Please try again."); return; }
      officerId = data.id;
    }
    const { error: aliasErr } = await supabase.from("officer_aliases").upsert([{ alias_norm: name.key, officer_id: officerId }], { onConflict: "alias_norm" });
    if (aliasErr) { setBusy(null); alert("Couldn't save the name. Please try again."); return; }
    for (const t of TABLES) {
      const ids = name.refs.filter((r) => r.table === t).map((r) => r.id);
      if (ids.length) await supabase.from(t).update({ officer_id: officerId }).in("id", ids);
    }
    setUnmatched((prev) => prev.filter((u) => u.key !== name.key));
    if (choice === "__new__") load();
    setBusy(null);
  };

  const total = callOffs.length + timeOff.length + notices.length + unmatched.length;

  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", marginBottom: "1.5rem", boxShadow: "0 10px 30px rgba(15,23,42,0.06)" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <div style={{ fontSize: "1.15rem", fontWeight: 700, color: TEXT }}>Needs your attention</div>
        {loaded && <span style={{ background: total ? "#fee2e2" : "#dcfce7", color: total ? RED : GREEN, fontWeight: 700, fontSize: "0.85rem", borderRadius: 999, padding: "2px 10px" }}>{total}</span>}
      </div>

      {!loaded ? (
        <div style={{ padding: "1.25rem 1.5rem", color: MUTED }}>Loading…</div>
      ) : total === 0 ? (
        <div style={{ padding: "1.25rem 1.5rem", color: GREEN, fontWeight: 600 }}>✓ All caught up. Nothing waiting on you.</div>
      ) : (
        <div>
          {callOffs.map((c) => {
            const late = c.notice_type?.startsWith("Less");
            return (
              <Row key={c.id} tag="Call-off" tagColor={AMBER}
                title={c.officer_name}
                detail={`${formatDate(c.shift_date)}${c.shift_start ? ` · ${c.shift_start}` : ""} · ${c.reason}${late ? " · under 4 hrs notice" : ""}${c.document_url ? " · 📎 doc" : ""}`}
                warn={late}>
                <Btn color={GREEN} disabled={busy === c.id} onClick={() => setExcusal(c.id, "excused")}>Excuse</Btn>
                <Btn color={RED} disabled={busy === c.id} onClick={() => setExcusal(c.id, "unexcused")}>Unexcused</Btn>
              </Row>
            );
          })}

          {timeOff.map((t) => (
            <Row key={t.id} tag="Time off" tagColor={NAVY} title={t.officer_name} detail={`${t.absence_type} · ${t.dates_requested}`}>
              <LinkBtn href={`https://timeoffrequest.xing.wtf/approve?id=${t.id}`}>Review</LinkBtn>
            </Row>
          ))}

          {notices.map((n) => (
            <Row key={n.id} tag="Unsigned write-up" tagColor={RED} title={n.officer_name} detail={n.action_type || n.infraction || "Disciplinary notice"}>
              <LinkBtn href={`https://disciplinaryformresponse.xing.wtf/view?id=${n.id}`}>Open</LinkBtn>
            </Row>
          ))}

          {unmatched.map((u) => (
            <Row key={u.key} tag="New name" tagColor="#7c3aed" title={`"${u.display}"`}
              detail={`${u.refs.length} submission${u.refs.length === 1 ? "" : "s"} not linked to an officer yet. Who is this?`}>
              <select defaultValue="" disabled={busy === u.key} onChange={(e) => matchName(u, e.target.value)}
                style={{ minHeight: 44, borderRadius: 10, border: `1.5px solid ${BORDER}`, padding: "0 0.6rem", fontFamily: "inherit", color: TEXT, background: WHITE, maxWidth: 220 }}>
                <option value="" disabled>Match to officer…</option>
                <option value="__new__">➕ New officer: {u.display}</option>
                {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ tag, tagColor, title, detail, warn, children }: { tag: string; tagColor: string; title: string; detail: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className="attn-row" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.85rem 1.5rem", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: tagColor, background: `${tagColor}14`, borderRadius: 999, padding: "2px 9px" }}>{tag}</span>
          <span style={{ fontWeight: 700, color: TEXT }}>{title}</span>
        </div>
        <div style={{ fontSize: "0.88rem", color: warn ? AMBER : MUTED, marginTop: 3 }}>{detail}</div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Btn({ color, disabled, onClick, children }: { color: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ minHeight: 40, padding: "0 0.9rem", borderRadius: 10, border: `1.5px solid ${color}`, background: WHITE, color, fontWeight: 700, fontSize: "0.88rem", fontFamily: "inherit", opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

function LinkBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{ minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 0.9rem", borderRadius: 10, background: NAVY, color: WHITE, fontWeight: 700, fontSize: "0.88rem", textDecoration: "none" }}>
      {children}
    </a>
  );
}
