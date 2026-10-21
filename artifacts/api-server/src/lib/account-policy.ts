export const companyEmailDomain = "one-line.com";

export function isCompanyEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${companyEmailDomain}`);
}
