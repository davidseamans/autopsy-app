import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface CrmColumn {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

interface Props {
  title: string;
  table: string;
  columns: CrmColumn[];
  newLabel?: string;
  select?: string;
}

function fmtDate(v: unknown) {
  if (!v) return "—";
  try {
    return new Date(String(v)).toLocaleDateString();
  } catch {
    return "—";
  }
}

export default function CrmTablePage({
  title,
  table,
  columns,
  newLabel,
  select = "*",
}: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["crm", table, select],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, unknown>[];
    },
    retry: false,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <Button className="bg-[hsl(var(--autopsy-accent))] hover:bg-[hsl(var(--autopsy-accent))]/90 text-[hsl(var(--autopsy-accent-foreground))]">
          <Plus className="h-4 w-4" />
          {newLabel ?? `New ${title.replace(/s$/, "")}`}
        </Button>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-center text-muted-foreground py-10"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-center text-muted-foreground py-10"
                >
                  No data available.
                </TableCell>
              </TableRow>
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-center text-muted-foreground py-10"
                >
                  No records yet.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, i) => (
                <TableRow key={(row.id as string) ?? i}>
                  {columns.map((c) => {
                    const raw = c.render
                      ? c.render(row)
                      : c.key === "created_at"
                        ? fmtDate(row[c.key])
                        : (row[c.key] as React.ReactNode);
                    return (
                      <TableCell key={c.key}>
                        {raw === undefined || raw === null || raw === ""
                          ? "—"
                          : raw}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}