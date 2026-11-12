import { queryOptions } from "@tanstack/react-query";
import { getSettings, listPins } from "./pins.functions";

export const pinsQuery = queryOptions({ queryKey: ["pins"], queryFn: () => listPins() });
export const settingsQuery = queryOptions({ queryKey: ["settings"], queryFn: () => getSettings() });
