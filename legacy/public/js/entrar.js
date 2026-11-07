// Login dos painéis. /entrar mostra a escolha; /entrar/cidade (admin geral e da cidade)
// e /entrar/barbearia (dono da barbearia) são as entradas de cada painel.
const $ = (id) => document.getElementById(id);
const AREAS = {
  cidade: {
    badge: 'Admin da cidade', title: 'Painel da cidade',
    sub: 'Para o admin da cidade e o admin geral do Cidade 10.',
    other: 'Tem uma barbearia? <a href="/entrar/barbearia">Entre por aqui</a>',
    volta: /^\/(admin|painel)([/?#]|$)/,
  },
  barbearia: {
    badge: 'Barbearia', title: 'Painel da barbearia',
    sub: 'Agenda, barbeiros, serviços, clientes e financeiro.',
    other: 'É admin da cidade? <a href="/entrar/cidade">Entre por aqui</a>',
    volta: /^\/admin([/?#]|$)/,
  },
};
const area = location.pathname.split('/')[2];
const cfg = AREAS[area];
const volta = new URLSearchParams(location.search).get('volta');
// Só aceita caminhos internos do próprio painel como destino depois do login.
const safeVolta = cfg && volta && cfg.volta.test(volta) ? volta : null;

const me = await fetch('/api/auth/me').then((r) => r.json()).catch(() => ({}));
if (me.authenticated) location.replace(safeVolta || (me.user.role === 'shop' ? '/admin' : '/painel'));

if (!cfg) {
  $('chooser').hidden = false;
} else {
  document.body.classList.add(`area-${area}`);
  document.title = `${cfg.title} · Cidade 10`;
  $('badge').textContent = cfg.badge;
  $('title').textContent = cfg.title;
  $('sub').textContent = cfg.sub;
  $('other').innerHTML = cfg.other;
  $('login').hidden = false;
}

$('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('btn').disabled = true;
  $('err').hidden = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('email').value, password: $('password').value, area }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível entrar.');
    location.href = safeVolta || data.redirect;
  } catch (err) {
    $('err').textContent = err.message;
    $('err').hidden = false;
    $('btn').disabled = false;
  }
});
