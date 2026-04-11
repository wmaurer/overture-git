export const parseStatus = (status: string): Array<string> => {
    if (status.trim() === "") return [];
    return status
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
            const path = line.slice(3);
            // Handle renames: "R  old.ts -> new.ts"
            const arrowIndex = path.indexOf(" -> ");
            return arrowIndex !== -1 ? path.slice(arrowIndex + 4) : path;
        });
};
