// Xblog 前端交互脚本（原生 JS，无框架依赖，轻量流畅）
export const APP_JS = `
(function(){
  var sidebar = document.querySelector('.xb-sidebar');
  var toggle = document.querySelector('.xb-mobile-toggle');
  if (toggle) toggle.addEventListener('click', function(){
    if (sidebar) sidebar.classList.toggle('open');
    else document.querySelector('.xb-tabs').classList.toggle('open');
  });

  // 搜索框：回车跳转搜索页
  var search = document.getElementById('xb-search-input');
  if (search) {
    search.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        var q = encodeURIComponent(search.value.trim());
        window.location.href = '/search?q=' + q;
      }
    });
  }

  // 评论 & 点赞（在文章页）
  var slugEl = document.getElementById('xb-post-slug');
  if (slugEl) {
    var slug = slugEl.value;
    loadComments(slug);
    var likeBtn = document.getElementById('xb-like-btn');
    if (likeBtn) likeBtn.addEventListener('click', function(){ toggleLike(slug); });
    var form = document.getElementById('xb-comment-form');
    if (form) form.addEventListener('submit', function(e){
      e.preventDefault();
      var textarea = document.getElementById('xb-comment-input');
      var body = textarea.value.trim();
      if (!body) return;
      fetch('/api/comments/' + slug, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ body: body }) })
        .then(function(r){ return r.json(); })
        .then(function(data){
          if (data.error) { toast(data.error); return; }
          textarea.value = '';
          loadComments(slug);
        }).catch(function(){ toast('评论发送失败'); });
    });
  }

  function loadComments(slug){
    var box = document.getElementById('xb-comments-list');
    var likeCount = document.getElementById('xb-like-count');
    fetch('/api/comments/' + slug).then(function(r){ return r.json(); }).then(function(data){
      if (likeCount) likeCount.textContent = data.likes || 0;
      var likeBtn = document.getElementById('xb-like-btn');
      if (likeBtn && data.liked) likeBtn.classList.add('liked');
      if (!box) return;
      if (!data.comments || !data.comments.length) {
        box.innerHTML = '<div class="xb-empty">还没有评论，来抢沙发吧～</div>';
        return;
      }
      box.innerHTML = data.comments.map(function(c){
        return '<div class="xb-comment"><img src="'+c.avatar+'" alt=""/><div><div><span class="name">'+escapeHtml(c.login)+'</span><span style="opacity:.5;font-size:12px">'+new Date(c.createdAt).toLocaleString()+'</span></div><div class="body">'+escapeHtml(c.body)+'</div></div></div>';
      }).join('');
    }).catch(function(){ if(box) box.innerHTML = '<div class="xb-empty">评论加载失败</div>'; });
  }

  function toggleLike(slug){
    fetch('/api/like/' + slug, { method:'POST' }).then(function(r){ return r.json(); }).then(function(data){
      if (data.error) { toast(data.error); return; }
      var likeCount = document.getElementById('xb-like-count');
      var likeBtn = document.getElementById('xb-like-btn');
      if (likeCount) likeCount.textContent = data.likes;
      if (likeBtn) likeBtn.classList.toggle('liked', data.liked);
    }).catch(function(){ toast('操作失败'); });
  }

  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  window.xbToast = toast;
  function toast(msg){
    var el = document.getElementById('xb-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'xb-toast';
      el.className = 'xb-toast xb-glass';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function(){ el.classList.remove('show'); }, 2200);
  }
})();
`;
