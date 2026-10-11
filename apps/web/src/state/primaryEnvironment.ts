import { Atom } from "effect/reactivity";

import { environmentCatalog } from "../connection/catalog";

export const primaryEnvironmentIdAtom = Atom.make((get) => {
  const entries = get(environmentCatalog.catalogValueAtom).entries;
  for (const [environmentId, entry] of entries) {
    if (entry.target._tag === "PrimaryConnectionTarget") {
      return environmentId;
    }
  }
  const first = entries.keys().next().value;
  return first ?? null;
}).pipe(Atom.withLabel("web-primary-environment-id"));
