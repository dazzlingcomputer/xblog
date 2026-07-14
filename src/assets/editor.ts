// Xblog 后台 Markdown 编辑器脚本：Word 般的易用体验 + 实时预览 + 图片/音频上传 + B站/YouTube 嵌入
export const EDITOR_JS = `
(function(){
  var input = document.getElementById('xb-md-input');
  var preview = document.getElementById('xb-md-preview');
  if (!input) return;

  function render(){
    fetch('/admin/preview', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ md: input.value }) })
      .then(function(r){ return r.text(); })
      .then(function(html){ preview.innerHTML = html; })
      .catch(function(){});
  }
  var timer = null;
  input.addEventListener('input', function(){
    clearTimeout(timer);
    timer = setTimeout(render, 350);
  });
  render();

  function wrap(before, after){
    after = after || before;
    var start = input.selectionStart, end = input.selectionEnd;
    var val = input.value;
    var selected = val.slice(start, end) || '文字';
    input.value = val.slice(0, start) + before + selected + after + val.slice(end);
    input.focus();
    input.selectionStart = start + before.length;
    input.selectionEnd = start + before.length + selected.length;
    render();
  }
  function insertAtCursor(text){
    var start = input.selectionStart, end = input.selectionEnd;
    var val = input.value;
    input.value = val.slice(0, start) + text + val.slice(end);
    input.focus();
    var pos = start + text.length;
    input.selectionStart = input.selectionEnd = pos;
    render();
  }

  document.querySelectorAll('[data-md]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var cmd = btn.getAttribute('data-md');
      if (cmd === 'bold') wrap('**');
      else if (cmd === 'italic') wrap('*');
      else if (cmd === 'strike') wrap('~~');
      else if (cmd === 'code') wrap('\`');
      else if (cmd === 'h2') insertAtCursor('\\n## 标题\\n');
      else if (cmd === 'h3') insertAtCursor('\\n### 标题\\n');
      else if (cmd === 'quote') insertAtCursor('\\n> 引用文字\\n');
      else if (cmd === 'ul') insertAtCursor('\\n- 列表项\\n');
      else if (cmd === 'ol') insertAtCursor('\\n1. 列表项\\n');
      else if (cmd === 'hr') insertAtCursor('\\n---\\n');
      else if (cmd === 'link') insertAtCursor('[链接文字](https://)');
      else if (cmd === 'table') insertAtCursor('\\n| 列1 | 列2 |\\n| --- | --- |\\n| a | b |\\n');
      else if (cmd === 'bilibili') {
        var bv = prompt('请输入 B 站视频 BV 号，如 BV1xx411c7XX');
        if (bv) insertAtCursor('\\n:::bilibili ' + bv.trim() + ':::\\n');
      } else if (cmd === 'youtube') {
        var yid = prompt('请输入 YouTube 视频 ID，如 dQw4w9WgXcQ');
        if (yid) insertAtCursor('\\n:::youtube ' + yid.trim() + ':::\\n');
      } else if (cmd === 'image') {
        document.getElementById('xb-file-image').click();
      } else if (cmd === 'audio') {
        document.getElementById('xb-file-audio').click();
      }
    });
  });

  function upload(file, cb){
    var reader = new FileReader();
    reader.onload = function(){
      var base64 = reader.result.split(',')[1];
      fetch('/admin/upload', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ filename: file.name, data: base64 })
      }).then(function(r){ return r.json(); }).then(function(data){
        if (data.url) cb(data.url); else alert('上传失败: ' + (data.error || '未知错误'));
      }).catch(function(){ alert('上传失败'); });
    };
    reader.readAsDataURL(file);
  }

  var imgInput = document.getElementById('xb-file-image');
  if (imgInput) imgInput.addEventListener('change', function(){
    var f = imgInput.files[0]; if (!f) return;
    upload(f, function(url){ insertAtCursor('\\n![图片](' + url + ')\\n'); });
    imgInput.value = '';
  });
  var audioInput = document.getElementById('xb-file-audio');
  if (audioInput) audioInput.addEventListener('change', function(){
    var f = audioInput.files[0]; if (!f) return;
    upload(f, function(url){ insertAtCursor('\\n![音频](' + url + ')\\n'); });
    audioInput.value = '';
  });

  // 拖拽上传图片
  input.addEventListener('dragover', function(e){ e.preventDefault(); });
  input.addEventListener('drop', function(e){
    e.preventDefault();
    var file = e.dataTransfer.files[0];
    if (file) upload(file, function(url){
      var isAudio = /\\.(mp3|wav|ogg|m4a)$/i.test(file.name);
      insertAtCursor('\\n![' + (isAudio ? '音频' : '图片') + '](' + url + ')\\n');
    });
  });

  // 封面图上传
  var coverInput = document.getElementById('xb-file-cover');
  if (coverInput) coverInput.addEventListener('change', function(){
    var f = coverInput.files[0]; if (!f) return;
    upload(f, function(url){
      document.getElementById('xb-cover-url').value = url;
      var img = document.getElementById('xb-cover-preview');
      if (img) { img.src = url; img.style.display = 'block'; }
    });
  });
})();
`;
