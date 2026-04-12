import { parse, type Document, type Node } from "@bgotink/kdl";

const nodeToValue = (node: Node): unknown => {
    if (node.hasChildren()) {
        return documentToObject(node.children!);
    }
    return node.getArgument(0) ?? null;
};

const documentToObject = (doc: Document): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const node of doc.nodes) {
        result[node.getName()] = nodeToValue(node);
    }
    return result;
};

export const parseKdlToObject = (text: string): Record<string, unknown> => {
    const doc = parse(text);
    return documentToObject(doc);
};
