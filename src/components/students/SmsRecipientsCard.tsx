import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, AlertTriangle, Star, Plus } from "lucide-react";
import { addSmsRecipient, setDefaultSmsRecipient, toggleSmsRecipientActive } from "./sms-actions";

interface Contact {
  id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
  isDefault: boolean;
}

// Shared SMS-recipient manager: shows the default + flag and lets office/admin
// add recipients, set the default, and activate/deactivate. Used on both the
// admin and office student pages.
export function SmsRecipientsCard({
  studentId,
  contacts,
  flagged,
  flagReason,
}: {
  studentId: string;
  contacts: Contact[];
  flagged: boolean;
  flagReason: string | null;
}) {
  return (
    <Card className={flagged ? "border-amber-300" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          SMS recipients
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {flagged && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{flagReason ?? "Ο προεπιλεγμένος αριθμός SMS χρειάζεται έλεγχο."}</span>
          </div>
        )}

        {contacts.length === 0 ? (
          <p className="text-sm text-slate-400">None on record</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className={`font-medium truncate flex items-center gap-1.5 ${c.active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                    {c.name}
                    {c.isDefault && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                        <Star className="w-2.5 h-2.5 mr-0.5" /> Default
                      </Badge>
                    )}
                    {!c.active && (
                      <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500 border-slate-200 shrink-0">
                        Inactive
                      </Badge>
                    )}
                  </p>
                  <p className="text-slate-500 text-xs font-mono">{c.phone}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="text-xs capitalize">{c.role.toLowerCase()}</Badge>
                  {!c.isDefault && c.active && (
                    <form action={setDefaultSmsRecipient}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="contactId" value={c.id} />
                      <button type="submit" className="text-xs text-slate-400 hover:text-emerald-600" title="Set as default">
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  )}
                  <form action={toggleSmsRecipientActive}>
                    <input type="hidden" name="contactId" value={c.id} />
                    <button type="submit" className="text-xs text-slate-400 hover:text-slate-700">
                      {c.active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add another recipient */}
        <form action={addSmsRecipient} className="border-t border-slate-100 pt-3 space-y-2">
          <input type="hidden" name="studentId" value={studentId} />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Add recipient</p>
          <input
            name="name"
            required
            placeholder="Name"
            className="w-full h-8 px-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-2">
            <input
              name="phone"
              required
              placeholder="Phone"
              className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <select
              name="role"
              defaultValue="OTHER"
              className="h-8 px-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="FATHER">Father</option>
              <option value="MOTHER">Mother</option>
              <option value="GUARDIAN">Guardian</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
