export const parseBinaryFiles = (numstat: string): Array<string> => {
    if (numstat.trim() === "") return [];
    return numstat
        .split("\n")
        .filter((line) => line.startsWith("-\t-\t"))
        .map((line) => line.slice(4));
};
