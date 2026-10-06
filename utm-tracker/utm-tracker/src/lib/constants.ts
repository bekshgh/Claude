export const UTM_SOURCES = [
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Email" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "google", label: "Google" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referral", label: "Referral / partners" },
  { value: "qr", label: "QR code (offline)" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "website", label: "Website" },
];

export const UTM_MEDIUMS = [
  { value: "social", label: "social — organic post / story" },
  { value: "target", label: "target — paid ads" },
  { value: "email", label: "email — mailing" },
  { value: "referral", label: "referral — partner link" },
  { value: "offline", label: "offline — poster / banner / QR" },
  { value: "bio", label: "bio — link in bio" },
  { value: "message", label: "message — DM / chat" },
];

export type Option = { value: string; label: string };
