import importlib.util, os, struct, numpy, torch, sys
HER="verktoy"
spec = importlib.util.spec_from_file_location("mlb_tren", os.path.join(HER,"mlb-tren.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0,HER)
gspec = importlib.util.spec_from_file_location("g", os.path.join(HER,"mlb-gradient.py"))
g = importlib.util.module_from_spec(gspec); gspec.loader.exec_module(g)
rad, dim, mdim, versjon = g.les_erfaring("mlb-epoke-data-127r/erf-s0.bin", maks=8)
X = torch.from_numpy(numpy.ascontiguousarray(rad["t"])).float()
mod = m.Sandkassenett(dim, [1024,768,512])
m.les_vekter("e1-modell/v127/mlb-roeyk.bin", mod)
mod.eval()
with torch.no_grad():
    p,v,t,vr,vh,st,kv = mod.alt(X)
numpy.save("analyse/127-sjekk/x.npy", X.numpy())
for i in range(len(X)):
    print(f"{i} V={float(v[i]):.6f} Vr={float(vr[i]):.6f} Vh={float(vh[i]):.6f} kvsnitt={float(kv[i].mean()):.6f} st0={float(st[i][0]):.6f}")
