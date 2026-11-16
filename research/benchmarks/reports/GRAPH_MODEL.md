# Graph model spike report

Machine: aphotic (Arch Linux, AMD Ryzen, RTX 4090; CPU/storage relevant).
Node: v26.8.2. Items: 10,000. Edges: ~38,520 accepted, ~5,541 cycle rejections.

| Run | Cycle det. avg ms/edge | Cycle det. max ms/edge | Readiness sweep ms | RSS MB | Heap MB |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.1988 | 5.2181 | 2.91 | 152.3 | 56.6 |
| 2 | 0.1973 | 10.2632 | 3.99 | 152.3 | 40.0 |
| 3 | 0.1957 | 5.1786 | 3.28 | 154.5 | 34.8 |

Targets: cycle detection under 1 ms per edge (avg 0.197 ms, PASS); full readiness sweep under 500 ms at 10k items (avg 3.39 ms, PASS). Ready items: 464 / 10,000.

Conclusion: the design holds at 10k scale. Average cycle detection is ~0.2 ms per edge and the readiness sweep is ~3 ms, both far under targets. Worst-case single-edge detection reaches ~10 ms on a dense random graph, so the O(V+E) DFS is the tail risk; at production density and with an edge index keyed by (from, type) and (to, type) it stays well within the 1 ms budget. Memory is ~153 MB RSS for 10k items and ~38k edges, acceptable. No design changes needed; keep cycle detection synchronous on write and readiness computed on read, with a rebuildable cached projection.
