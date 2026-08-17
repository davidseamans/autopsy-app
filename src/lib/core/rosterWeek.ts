import { addDays, format, startOfWeek } from "date-fns";

export interface RosterWeek {
  startsOn: string;
  endsOn: string;
}

export function getRosterWeek(anchor: Date): RosterWeek {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 });
  return {
    startsOn: format(monday, "yyyy-MM-dd"),
    endsOn: format(addDays(monday, 6), "yyyy-MM-dd"),
  };
}
