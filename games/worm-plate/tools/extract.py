import re, json, sys
src = open(sys.argv[1], encoding='utf-8').read()
table = {}
cur = None
for line in src.splitlines():
    m = re.match(r'^def ([A-Za-z0-9]+)\(\):', line)
    if m:
        cur = m.group(1); continue
    m = re.match(r"^\s+postSynaptic\['([A-Za-z0-9]+)'\]\[nextState\] \+= (-?\d+)", line)
    if m and cur and cur not in ('createpostSynaptic','motorcontrol','dendriteAccumulate','fireNeuron','runconnectome','main','keyboard_interrupt_handler'):
        table.setdefault(cur, {})
        table[cur][m.group(1)] = table[cur].get(m.group(1), 0) + int(m.group(2))
neurons = sorted(set(table) | {t for d in table.values() for t in d if not t.startswith('M')})
muscles = sorted({t for d in table.values() for t in d if t.startswith('M')})
syn = sum(len(d) for d in table.values())
print('pre neurons', len(table), 'all neuron names', len(neurons), 'muscle targets', len(muscles), 'synapse entries', syn, file=sys.stderr)
json.dump({'neurons': neurons, 'muscles': muscles, 'table': table}, open(sys.argv[2], 'w'), separators=(',', ':'))
