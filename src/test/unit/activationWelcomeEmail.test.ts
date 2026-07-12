import { describe, it, expect } from "vitest";
import { activationWelcomeEmail } from "@/lib/accessCode";

describe("activationWelcomeEmail", () => {
  it("builds a student welcome with subject and sign-in line", () => {
    const mail = activationWelcomeEmail("student", "Νικολάου Μαρία", "https://sms.school.cy");
    expect(mail.subject).toContain("Ο λογαριασμός σας δημιουργήθηκε");
    expect(mail.text).toContain("μαθητικός σας λογαριασμός ενεργοποιήθηκε");
    expect(mail.text).toContain("https://sms.school.cy/el/login");
    expect(mail.text).toContain("Your student account has been activated");
  });

  it("builds a guardian welcome that names the linked student", () => {
    const mail = activationWelcomeEmail("guardian", "Νικολάου Μαρία", "https://sms.school.cy");
    expect(mail.subject).toContain("κηδεμόνα");
    expect(mail.text).toContain("Νικολάου Μαρία");
    expect(mail.text).toContain("άλλο παιδί");
    expect(mail.text).toContain("To link another child");
  });

  it("omits the sign-in line when no base URL is configured", () => {
    const mail = activationWelcomeEmail("student", "", "");
    expect(mail.text).not.toContain("Σελίδα σύνδεσης");
    expect(mail.text).not.toContain("/el/login");
  });

  it("strips trailing slashes from the base URL", () => {
    const mail = activationWelcomeEmail("guardian", "", "https://sms.school.cy/");
    expect(mail.text).toContain("https://sms.school.cy/el/login");
    expect(mail.text).not.toContain("cy//el");
  });

  it("copes with a missing student name in the guardian email", () => {
    const mail = activationWelcomeEmail("guardian", "", "");
    expect(mail.text).toContain("συνδέθηκε επιτυχώς με τον/τη μαθητή/ρια.");
  });
});
