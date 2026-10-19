import { getSchoolName } from "@/lib/schoolConfig";
import { breakProgress } from "@/lib/breakDuty";
import type { BreakDutyDay } from "@/server/breakDuty";

const GREEK_DAYS = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];

function fullDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${GREEK_DAYS[new Date(iso + "T12:00:00Z").getUTCDay()]} ${d}/${m}/${y}`;
}

/**
 * «ΑΝΑΦΟΡΑ ΕΦΗΜΕΡΕΥΣΗΣ ΕΚΠΑΙΔΕΥΤΙΚΩΝ» for one day — the A4 the on-duty
 * deputies sign and hand to the secretaries. Official print: Greek labels,
 * full year (like the other official documents).
 */
export async function BreakDutyReport({ day }: { day: BreakDutyDay }) {
  const schoolName = await getSchoolName();
  const absences = day.rows.flatMap((r) =>
    day.breaks
      .filter((b) => r.cells[b.no]?.present === false)
      .map((b) => ({ breakNo: b.no, post: `${r.postCode} ${r.postName}`, teacher: r.teacherName })),
  );
  const comments = day.rows.flatMap((r) =>
    day.breaks
      .filter((b) => r.cells[b.no]?.comment)
      .map((b) => ({ breakNo: b.no, post: r.postCode, teacher: r.teacherName, text: r.cells[b.no]!.comment! })),
  );

  return (
    <div className="text-[11px] leading-snug text-slate-900">
      <div className="text-center mb-4 pb-3 border-b-2 border-slate-800">
        {schoolName && <p className="text-[10px] uppercase tracking-widest text-slate-500">{schoolName}</p>}
        <h1 className="text-lg font-bold mt-1">ΑΝΑΦΟΡΑ ΕΦΗΜΕΡΕΥΣΗΣ ΕΚΠΑΙΔΕΥΤΙΚΩΝ</h1>
        <p className="text-sm text-slate-700">{fullDate(day.dateIso)}</p>
      </div>

      {day.breaks.length === 0 || day.posts.length === 0 ? (
        <p className="text-sm text-slate-500">
          {day.breaks.length === 0 ? "Δεν υπάρχει σχολείο αυτή την ημέρα." : "Δεν έχει εισαχθεί πρόγραμμα εφημέρευσης."}
        </p>
      ) : (
        <>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 px-1 py-1 w-10">Α/Α</th>
                <th className="border border-slate-400 px-1 py-1 text-left">Χώρος</th>
                <th className="border border-slate-400 px-1 py-1 text-left">Εκπαιδευτικός</th>
                {day.breaks.map((b) => (
                  <th key={b.no} className="border border-slate-400 px-1 py-1 w-16">
                    {b.no}ο Διάλ.
                    <span className="block font-normal text-[9px]">{b.from}–{b.to}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {day.posts.map((p) => {
                const prow = day.rows.filter((r) => r.postCode === p.code);
                if (prow.length === 0) {
                  return (
                    <tr key={p.code} className="break-inside-avoid">
                      <td className="border border-slate-400 px-1 py-0.5 text-center">{p.code}</td>
                      <td className="border border-slate-400 px-1 py-0.5">{p.name}</td>
                      <td className="border border-slate-400 px-1 py-0.5 text-slate-400" colSpan={1 + day.breaks.length}>—</td>
                    </tr>
                  );
                }
                return prow.map((r, i) => (
                  <tr key={`${p.code}|${r.teacherName}`} className="break-inside-avoid">
                    {i === 0 && (
                      <>
                        <td rowSpan={prow.length} className="border border-slate-400 px-1 py-0.5 text-center align-top">{p.code}</td>
                        <td rowSpan={prow.length} className="border border-slate-400 px-1 py-0.5 align-top">{p.name}</td>
                      </>
                    )}
                    <td className="border border-slate-400 px-1 py-0.5">{r.teacherName}</td>
                    {day.breaks.map((b) => {
                      const c = r.cells[b.no];
                      const mark = c?.present === true ? "✓" : c?.present === false ? "✗" : "—";
                      return (
                        <td
                          key={b.no}
                          className={`border border-slate-400 px-1 py-0.5 text-center ${c?.present === false ? "font-bold" : c?.present == null ? "text-slate-400" : ""}`}
                        >
                          {mark}
                          {c?.comment && <sup>*</sup>}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>

          <p className="mt-1 text-[10px] text-slate-500">✓ Παρών/ούσα · ✗ Απών/ούσα · — Δεν ελέγχθηκε</p>
          <div className="mt-1 flex flex-wrap gap-x-6 text-[10px] text-slate-600">
            {day.breaks.map((b) => {
              const pr = breakProgress(day.rows, b.no);
              return (
                <span key={b.no}>
                  {b.no}ο διάλειμμα: ελέγχθηκαν {pr.checked}/{pr.total}, απουσίες {pr.absent}
                </span>
              );
            })}
          </div>

          <section className="mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wide border-b border-slate-300 pb-0.5 mb-1">Απουσίες</h2>
            {absences.length === 0 ? (
              <p className="text-slate-500">Καμία απουσία.</p>
            ) : (
              <ul className="list-disc pl-5">
                {absences.map((a, i) => (
                  <li key={i}>
                    {a.breakNo}ο διάλειμμα — {a.post}: <strong>{a.teacher}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {comments.length > 0 && (
            <section className="mt-3">
              <h2 className="text-xs font-bold uppercase tracking-wide border-b border-slate-300 pb-0.5 mb-1">* Σχόλια ανά χώρο</h2>
              <ul className="list-disc pl-5">
                {comments.map((c, i) => (
                  <li key={i}>
                    {c.breakNo}ο διάλειμμα — {c.post}, {c.teacher}: {c.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="mt-3">
        <h2 className="text-xs font-bold uppercase tracking-wide border-b border-slate-300 pb-0.5 mb-1">Συμβάντα ημέρας</h2>
        <p className="whitespace-pre-wrap min-h-[3rem]">{day.dayComments || "—"}</p>
      </section>

      <section className="mt-8 grid grid-cols-3 gap-6 text-center text-[10px] text-slate-600 break-inside-avoid">
        {(day.deputies.length > 0 ? day.deputies : ["", ""]).map((name, i) => (
          <div key={i}>
            <div className="border-t border-slate-500 pt-1 mt-8">
              Ο/Η Βοηθός Διευθυντής/ντρια
              {name && <div className="mt-0.5 font-medium text-slate-800">{name}</div>}
            </div>
          </div>
        ))}
        <div>
          <div className="border-t border-slate-500 pt-1 mt-8">
            Παραλήφθηκε — Γραμματεία
            <div className="mt-0.5">Ημερομηνία: ____________</div>
          </div>
        </div>
      </section>
    </div>
  );
}
