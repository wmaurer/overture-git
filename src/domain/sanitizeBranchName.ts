export const sanitizeBranchName = (name: string): string => name.replace(/\//g, "-").replace(/[^a-zA-Z0-9\-\.]/g, "");
