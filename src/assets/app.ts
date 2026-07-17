// Xblog 前端交互脚本（原生 JS，无框架依赖，轻量流畅）
export const APP_JS = `
(function(){
  var sidebar = document.querySelector('.xb-sidebar');
  var toggle = document.querySelector('.xb-mobile-toggle');
  if (toggle) toggle.addEventListener('click', function(){
    if (sidebar) sidebar.classList.toggle('open');
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

  // ---------------------------------------------------------------------
  // 通用文件上传：直接把文件的原始二进制发给 /admin/upload（不再包一层
  // base64 + JSON）。文件名通过 X-Xb-Filename 请求头传递。
  // 这样一来：
  //  1) 浏览器不用先把文件读成 base64 dataURL 再解析，省掉一次 CPU 开销；
  //  2) 传输体积不会被 base64 放大 33%；
  //  3) Worker 收到的是原始字节，不用再解析一个巨大的 JSON 字符串，
  //     大幅降低 CPU 占用——这是修复上传大文件时 Cloudflare "Error 1102"
  //     的关键之一（另一半在于下面的大小上限拦截）。
  // opts: { onProgress(percent) }
  // ---------------------------------------------------------------------
  var XB_MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB，需与后端 MAX_UPLOAD_BYTES 保持一致
  window.xbUpload = function(file, opts){
    opts = opts || {};
    return new Promise(function(resolve, reject){
      if (file.size > XB_MAX_UPLOAD_BYTES) {
        reject('文件过大（' + (file.size / 1024 / 1024).toFixed(1) + 'MB），最大支持 ' + Math.round(XB_MAX_UPLOAD_BYTES / 1024 / 1024) + 'MB');
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/admin/upload');
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-Xb-Filename', encodeURIComponent(file.name));
      xhr.upload.onprogress = function(e){
        if (e.lengthComputable && opts.onProgress) opts.onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = function(){
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (err) {}
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          if (opts.onProgress) opts.onProgress(100);
          resolve(data.url);
        } else {
          reject((data && data.error) || ('上传失败 (HTTP ' + xhr.status + ')'));
        }
      };
      xhr.onerror = function(){ reject('网络错误，上传失败'); };
      xhr.send(file);
    });
  };

  // 给一个 <input type="file"> 绑定"选择即上传"行为，自动在其后插入一条进度条。
  // onDone(url, file) 在上传成功后调用。
  window.xbBindUploadInput = function(input, onDone){
    if (!input) return;
    var box = document.createElement('div');
    box.className = 'xb-upload-progress';
    box.innerHTML = '<div class="xb-upload-progress-track"><div class="xb-upload-progress-bar"></div></div><span class="xb-upload-progress-text"></span>';
    input.insertAdjacentElement('afterend', box);
    var fill = box.querySelector('.xb-upload-progress-bar');
    var text = box.querySelector('.xb-upload-progress-text');
    input.addEventListener('change', function(){
      var f = input.files && input.files[0];
      if (!f) return;
      box.classList.remove('error');
      box.style.display = 'flex';
      fill.style.width = '0%';
      text.textContent = '上传中 0%';
      window.xbUpload(f, {
        onProgress: function(p){ fill.style.width = p + '%'; text.textContent = '上传中 ' + p + '%'; }
      }).then(function(url){
        text.textContent = '✅ 上传完成';
        onDone(url, f);
        setTimeout(function(){ box.style.display = 'none'; input.value = ''; }, 1000);
      }).catch(function(err){
        box.classList.add('error');
        text.textContent = '❌ ' + (typeof err === 'string' ? err : '上传失败');
        if (window.xbToast) window.xbToast(typeof err === 'string' ? err : '上传失败');
      });
    });
  };
})();
`;
