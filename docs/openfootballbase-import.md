# Importação controlada de OpenFootballBase

## Objetivo

Usar OpenFootballBase-Data como fonte complementar para localizar jogadores e elencos da temporada 2026/27, sem substituir a validação oficial exigida pelo Football Manager Browser.

Fonte: [OpenFootballBase-Data](https://github.com/florentfougeres/OpenFootballBase-Data), release `data-1.24.6` (23/11/2026). A release publica arquivos Parquet; os dados de elenco são derivados de páginas de temporada da Wikipédia (CC BY-SA 4.0) e os identificadores/dados Wikidata são CC0.

## Preparação

1. Baixe a release oficial `openfootballbase-data.tar.gz`.
2. Extraia o conteúdo em uma pasta local, por exemplo `./openfootballbase-data`.
3. Instale a dependência: `python3 -m pip install duckdb`.
4. Gere a fila de candidatos:

```bash
python3 scripts/stage-openfootballbase.py \
  --data-dir ./openfootballbase-data \
  --season 2026/27 \
  --as-of 2026-11-24 \
  --out ./data/staging/openfootballbase-2026-27.json
```

O script consulta os Parquet de elencos e nascimentos, calcula idade apenas quando a precisão da data de nascimento é diária (`precision=11`) e preserva QID, clube de origem, estado da passagem e referência exata da página/revisão.

## Regra de segurança

O resultado é uma fila de candidatos, não uma importação. O script não altera `database.json`, não associa automaticamente clubes a `teamId` e não declara ligas completas. Com `--database`, ele gera correspondências exatas por liga e sugestões aproximadas apenas para revisão; nenhuma sugestão recebe vínculo automático. Cada candidato precisa de revisão do clube atual e de seus dados antes de ser importado. Registros sem QID, posição, nacionalidade ou data de nascimento precisa ficam inelegíveis para revisão como cadastro completo. Passagens marcadas `left_mid` são excluídas.

Não deduplicar jogadores somente pelo nome. Preservar `sourceTitle` e `sourceRevision` para atribuição. Dados derivados de Wikipedia devem respeitar CC BY-SA 4.0, incluindo compartilhamento sob a mesma licença quando aplicável.

## Cobertura e limitações

O relatório de progresso da release é um indicador de clubes com ao menos um elenco publicado, não prova que o elenco esteja completo nem atualizado. A temporada aberta pode mudar a cada release. A documentação da fonte descreve os elencos como snapshots de páginas de temporada e alerta que transferências no meio da temporada podem aparecer em mais de um clube.

Cobertura reportada para 2026/27: Premier League 20/20, La Liga 20/20, Brasileirão Série A 20/20, Ligue 1 18/18, Belgian Pro League 18/18, Eredivisie 18/18, Primeira Liga 18/18 e Süper Lig 18/18. Suíça 10/12, Escócia 4/12 e Croácia 3/10. Argentina 30/30 e as demais ligas sul-americanas têm cobertura parcial. Esses números indicam presença de páginas com elenco, não completude de cada elenco.

Referências:
- [Dicionário de dados](https://github.com/florentfougeres/OpenFootballBase-Data/blob/main/docs/en/data-model.md)
- [Progresso por temporada e competição](https://github.com/florentfougeres/OpenFootballBase-Data/blob/main/PROGRESS.md)
- [FAQ e licenças](https://github.com/florentfougeres/OpenFootballBase-Data/blob/main/docs/en/faq.md)
