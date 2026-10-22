import { SITE } from "@aihot/site";
import { useRef } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/selectbench";
import type { AdminSelectBenchRuns } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, num, pct } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, Empty } from "../../features/admin/ui";
import { toast } from "../../features/admin/toast";


export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminSelectBenchRuns>(request, "/api/admin/selectbench");
}

export const meta: Route.MetaFunction = () => [{ title: `SelectBench · Painel do ${SITE.bareName}` }];

export default function SelectBench({ loaderData }: Route.ComponentProps) {
  const { run, pending } = useAdminAction();
  const file = useRef<HTMLInputElement>(null);
  return (
    <AdminPage
      title="SelectBench"
      subtitle="Comparação de modelos na decisão de seleção: o mesmo lote de amostras com gabarito humano, comparando item a item a decisão de cada modelo. As execuções são geradas por scripts/eval-selection.ts e importadas automaticamente; também é possível enviar o arquivo do relatório."
      actions={
        <>
          <input
            ref={file}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const report = JSON.parse(await f.text());
                await run("POST", "/api/admin/selectbench/import", { label: f.name.replace(/\.json$/, ""), report }, { label: "import", success: "Importado" });
              } catch {
                toast("O arquivo não é um JSON de relatório válido", "error");
              }
            }}
          />
          <Button busy={pending === "import"} onClick={() => file.current?.click()}>Importar relatório</Button>
        </>
      }
    >
      {loaderData.runs.length ? (
        <div className="space-y-4">
          {loaderData.runs.map((r) => {
            const best = [...r.models].sort((a, b) => (r.summary[b]?.f1 ?? 0) - (r.summary[a]?.f1 ?? 0))[0];
            return (
              <Card
                key={r.id}
                title={<Link to={`/admin/selectbench/${r.id}`} className="hover:text-accent">{r.label}</Link>}
                right={<span>{bj(r.created_at, true)} · {r.split ?? "—"} · {num(r.sample_size)} amostras · {r.prompt_version ?? "versão do prompt não registrada"}</span>}
                pad={false}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[12px] text-ink-3">
                        {["Modelo", "Acurácia nas saídas válidas", "Cobertura", "Acurácia total", "Precisão", "Revocação", "F1", "Taxa de seleção", "selecionados no gabarito", "Falhas", "Tempo médio", "Tokens entrada/saída"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {r.models.map((m) => {
                        const s = r.summary[m] ?? {};
                        return (
                          <tr key={m} className="border-b border-line/70 last:border-0">
                            <td className="px-3 py-2 font-medium text-ink">{m} {m === best && r.models.length > 1 && <Badge tone="accent">Maior F1 nas saídas válidas</Badge>}</td>
                            <td className="num px-3 py-2">{pct(s.accuracy)}</td>
                            <td className="num px-3 py-2">{pct(s.coverage)}</td>
                            <td className="num px-3 py-2 font-semibold text-ink">{pct(s.completeAccuracy)}</td>
                            <td className="num px-3 py-2">{pct(s.precision)}</td>
                            <td className="num px-3 py-2">{pct(s.recall)}</td>
                            <td className="num px-3 py-2 font-semibold text-ink">{pct(s.f1)}</td>
                            <td className="num px-3 py-2">{pct(s.selectedRate)}</td>
                            <td className="num px-3 py-2">{pct(s.goldSelectRate)}</td>
                            <td className="num px-3 py-2">{s.errors ? <span className="text-hot">{s.errors}</span> : 0}</td>
                            <td className="num px-3 py-2">{s.avgLatencyMs ? `${(s.avgLatencyMs / 1000).toFixed(1)}s` : "—"}</td>
                            <td className="num px-3 py-2 text-ink-3">{num(s.tokensIn)} / {num(s.tokensOut)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[12.5px] text-ink-3">
                  <span>{r.cases ? `${num(r.cases)} resultados item a item` : "Só o resumo"}</span>
                  {r.cases > 0 && <Link className="text-accent" to={`/admin/selectbench/${r.id}`}>Ver item a item</Link>}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><Empty>Ainda não há execuções de comparação. Rode scripts/eval-selection.ts e elas aparecem aqui automaticamente.</Empty></Card>
      )}
    </AdminPage>
  );
}
