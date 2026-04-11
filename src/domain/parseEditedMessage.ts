export const parseEditedMessage = (text: string): { subject: string; body: string } => {
    const parts = text.split(/\n\n+/);
    const subject = (parts[0] ?? "").trim();
    const body = parts.slice(1).join("\n\n").trim();
    return { subject, body };
};
