/* 방탈출N 공유 데이터 스토어 — 모든 화면이 이 파일에서 방탈출 데이터를 읽고 씁니다.
   localStorage 기반. 최초 1회 SEED로 초기화되고, 이후 편집/생성/삭제가 저장됩니다. */
(function () {
  // 이 파일이 두 번 평가되면 스토어 인스턴스가 두 개 생겨, 한쪽에 저장한 변경이
  // 다른 쪽 화면에서 안 보이게 된다(메모리 배열이 분리됨). 싱글턴으로 고정한다.
  //
  // 단, 이미 올라와 있는 게 "구버전"이면 교체해야 한다. 그냥 return 하면 새로 추가한
  // API 가 없어 `store.xxx is not a function` 으로 깨진다. → 버전 비교.
  var VERSION = 5;   // API 를 추가/변경하면 이 숫자를 올릴 것
  if (window.RoomStore && (window.RoomStore.__v || 1) >= VERSION) return;

  var KEY = 'bangtalN.rooms.v8';

  var THUMBS = {
    lab:   { bg: 'linear-gradient(135deg,#6ea8ff,#4a7fe0)', img: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80' },
    space: { bg: 'linear-gradient(135deg,#8b7bd8,#5b4bb0)', img: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&q=80' },
    book:  { bg: 'linear-gradient(135deg,#e0a96d,#c07a3a)', img: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&q=80' },
    ship:  { bg: 'linear-gradient(135deg,#5fc9c9,#2f9a9a)', img: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=600&q=80' },
  };

  // r1: 실험실 — 편집 authoring 페이지(맵) + 리치 플레이 시나리오(자물쇠 5종)
  // 대화 blocks: 호스트(진행자) · 내레이터(상황 서술) · 캐릭터(동료 조수 "코야")
  var R1_PAGES = [
    { id:'p1', num:1, type:'start',  lock:'mc', title:'실험실 입구', body:'낡은 철문 앞에 도착했어.\n문에는 암호 자물쇠가 달려 있어.', summary:'물질이 기체로 변하는 현상은 무엇일까?', x:241, y:36, choices:[{t:'얼음이 어는 것',c:false},{t:'물이 수증기가 되는 것',c:true},{t:'수증기가 물이 되는 것',c:false},{t:'물이 어는 것',c:false}], correctExit:'p2', wrongExit:null, points:100, hint:'액체가 기체로 변하는 현상을 떠올려 봐.', hintDeduct:50,
      dialog:{ bg:{name:'',img:''}, blocks:[
        { id:'b1', speaker:'host', type:'text', text:'어서 와! 사라진 실험실의 비밀에 도전한 걸 환영해.', img:'', delay:1 },
        { id:'b2', speaker:'narrator', type:'text', text:'낡은 철문 앞에 도착했다. 문에는 오래된 암호 자물쇠가 달려 있다.', img:'', delay:1 },
        { id:'b3', speaker:'char', type:'text', text:'으… 여기 좀 으스스한데. 우리 진짜 들어갈 수 있는 거 맞아?', img:'', delay:1 },
        { id:'b4', speaker:'host', type:'text', text:'자물쇠를 풀려면 첫 번째 문제를 맞혀야 해. 집중하자!', img:'', delay:1 },
      ], problem:{ lock:'mc', question:'물질이 기체로 변하는 현상은 무엇일까?', mc:[{id:'m1',text:'얼음이 어는 것',correct:false},{id:'m2',text:'물이 수증기가 되는 것',correct:true},{id:'m3',text:'수증기가 물이 되는 것',correct:false},{id:'m4',text:'물이 어는 것',correct:false}], short:'', ox:'O', order:[], hotspot:{img:'',label:'',x:46,y:47} } } },
    { id:'p2', num:2, type:'normal', lock:'ox', title:'온도 판단', body:'문이 열리자 온도계가 놓인 방이 나왔어.\n벽에 이런 문장이 적혀 있어.', summary:'“얼음이 녹는 동안 온도는 계속 올라간다.” 맞을까?', x:239, y:251, oxAnswer:'X', correctExit:'p3', wrongExit:'p8', points:100, hint:'상태가 변하는 동안의 온도를 생각해 봐.', hintDeduct:50,
      dialog:{ bg:{name:'',img:''}, blocks:[
        { id:'b1', speaker:'narrator', type:'text', text:'철문이 스르륵 열리고, 온도계가 잔뜩 놓인 두 번째 방이 나타났다.', img:'', delay:1 },
        { id:'b2', speaker:'char', type:'text', text:'와, 온도계가 이렇게 많아? 벽에 뭔가 적혀 있는데…', img:'', delay:1 },
        { id:'b3', speaker:'host', type:'text', text:'벽의 문장이 맞는지 틀린지 판단하면 다음 방으로 갈 수 있어.', img:'', delay:1 },
        { id:'b4', speaker:'char', type:'text', text:'틀리면 경보가 울린대! 신중하게 골라야 해.', img:'', delay:1 },
      ], problem:{ lock:'ox', question:'“얼음이 녹는 동안 온도는 계속 올라간다.” 맞을까?', mc:[], short:'', ox:'X', order:[], hotspot:{img:'',label:'',x:46,y:47} } } },
    { id:'p3', num:3, type:'normal', lock:'short', title:'증발의 원리', body:'다음 방에는 빈 칸이 있는 팻말이 있어.\n비커의 물이 점점 줄어드는 그림도 함께 있어.', summary:'이 현상을 부르는 두 글자 단어를 입력해 줘.', x:242, y:472, answer:'증발', correctExit:'p4', wrongExit:null, points:100, hint:'액체가 기체로 변하는 “ㅈㅂ”.', hintDeduct:50,
      dialog:{ bg:{name:'',img:''}, blocks:[
        { id:'b1', speaker:'host', type:'text', text:'잘했어! 경보 없이 통과했네. 세 번째 방이야.', img:'', delay:1 },
        { id:'b2', speaker:'narrator', type:'text', text:'방 한가운데에 빈 칸이 뚫린 낡은 팻말이 서 있다. 옆에는 비커의 물이 점점 줄어드는 그림이 그려져 있다.', img:'', delay:1 },
        { id:'b3', speaker:'char', type:'text', text:'물이 저절로 사라지고 있어… 이런 현상, 과학 시간에 배운 것 같은데?', img:'', delay:1 },
        { id:'b4', speaker:'host', type:'text', text:'팻말의 빈 칸에 들어갈 두 글자 단어를 입력해 봐.', img:'', delay:1 },
      ], problem:{ lock:'short', question:'이 현상을 부르는 두 글자 단어를 입력해 줘.', mc:[], short:'증발', ox:'O', order:[], hotspot:{img:'',label:'',x:46,y:47} } } },
    { id:'p4', num:4, type:'normal', lock:'order', title:'실험 순서', body:'실험대 위에 카드가 흩어져 있어.\n물을 끓이는 실험 순서를 맞춰야 해.', summary:'올바른 실험 순서대로 카드를 눌러 줘.', x:57, y:668, orderItems:['비커에 물을 넣는다','알코올램프에 불을 붙인다','물이 끓기 시작한다','수증기가 피어오른다'], orderAnswer:[0,1,2,3], correctExit:'p5', wrongExit:null, points:100, hint:'물을 담는 것이 가장 먼저야.', hintDeduct:50,
      dialog:{ bg:{name:'',img:''}, blocks:[
        { id:'b1', speaker:'narrator', type:'text', text:'네 번째 방. 실험대 위에 카드 네 장이 뒤죽박죽 흩어져 있다.', img:'', delay:1 },
        { id:'b2', speaker:'char', type:'text', text:'카드마다 실험 과정이 하나씩 적혀 있어. 순서가 엉망이야!', img:'', delay:1 },
        { id:'b3', speaker:'host', type:'text', text:'물을 끓이는 실험이야. 올바른 순서대로 카드를 눌러 정리해 줘.', img:'', delay:1 },
        { id:'b4', speaker:'char', type:'text', text:'가장 먼저 해야 할 게 뭘까? 침착하게 생각해 보자.', img:'', delay:1 },
      ], problem:{ lock:'order', question:'올바른 실험 순서대로 카드를 눌러 줘.', mc:[], short:'', ox:'O', order:[{id:'o1',text:'비커에 물을 넣는다'},{id:'o2',text:'알코올램프에 불을 붙인다'},{id:'o3',text:'물이 끓기 시작한다'},{id:'o4',text:'수증기가 피어오른다'}], hotspot:{img:'',label:'',x:46,y:47} } } },
    { id:'p5', num:5, type:'normal', lock:'hotspot', title:'반응 지점 찾기', body:'마지막 방이야! 실험 도구가 잔뜩 놓인 실험대야.\n지금 막 반응이 일어나고 있는 지점을 찾아야 문이 열려.', summary:'사진 속에서 "보라색 용액이 떨어지고 있는 곳"을 찾아 눌러 줘.', x:56, y:864, img:'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=900&q=80', hotspots:[{x:20,y:66,c:false,label:'빈 시험관'},{x:46,y:47,c:true,label:'용액 떨어지는 곳'},{x:76,y:64,c:false,label:'빈 시험관'}], correctExit:'p7', wrongExit:null, points:100, hint:'보라색 액체가 흘러내리는 가운데 지점을 잘 봐.', hintDeduct:50,
      dialog:{ bg:{name:'',img:''}, blocks:[
        { id:'b1', speaker:'host', type:'text', text:'드디어 마지막 방이야! 조금만 더 힘내자.', img:'', delay:1 },
        { id:'b2', speaker:'narrator', type:'text', text:'실험 도구가 잔뜩 놓인 커다란 실험대. 어딘가에서 지금 막 화학 반응이 일어나고 있다.', img:'', delay:1 },
        { id:'b3', speaker:'char', type:'text', text:'보라색 연기가 스멀스멀… 반응이 일어나는 곳을 찾아야 문이 열려!', img:'', delay:1 },
        { id:'b4', speaker:'host', type:'text', text:'사진을 잘 보고, 반응이 일어나는 정확한 지점을 눌러 봐.', img:'', delay:1 },
      ], problem:{ lock:'hotspot', question:'사진 속에서 "보라색 용액이 떨어지고 있는 곳"을 찾아 눌러 줘.', mc:[], short:'', ox:'O', order:[], hotspot:{img:'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=900&q=80',label:'용액 떨어지는 곳',x:46,y:47} } } },
    { id:'p7', num:6, type:'ending', endingType:'success', title:'탈출 성공!', body:'마지막 문을 열고 실험실을 무사히 빠져나왔다. 모든 미션을 해결했다. 축하합니다!', summary:'실험실 탈출에 성공했다', x:60, y:1060 },
    { id:'p8', num:7, type:'ending', endingType:'fail', title:'탈출 실패', body:'온도 판단을 잘못해 경보가 울리고 문이 잠겨버렸다. 다음 기회에 다시 도전해 보자.', summary:'시간 초과로 탈출에 실패했다', x:358, y:250 },
  ];
  var R1_PLAY = {
    title:'사라진 실험실의 비밀', hintPolicy:'deduct', hintCount:2, startId:'p1', total:5,
    pages:{
      p1:{ id:'p1', step:1, type:'normal', lock:'mc', lines:['낡은 철문 앞에 도착했어.','문에는 암호 자물쇠가 달려 있어.'], msgs:[{speaker:'host',type:'text',text:'어서 와! 사라진 실험실의 비밀에 도전한 걸 환영해.'},{speaker:'narrator',type:'text',text:'낡은 철문 앞에 도착했다. 문에는 오래된 암호 자물쇠가 달려 있다.'},{speaker:'char',type:'text',text:'으… 여기 좀 으스스한데. 우리 진짜 들어갈 수 있는 거 맞아?'},{speaker:'host',type:'text',text:'자물쇠를 풀려면 첫 번째 문제를 맞혀야 해. 집중하자!'}], q:'물질이 기체로 변하는 현상은 무엇일까?', choices:[{t:'얼음이 어는 것',c:false},{t:'물이 수증기가 되는 것',c:true},{t:'수증기가 물이 되는 것',c:false},{t:'물이 어는 것',c:false}], correctExit:'p2', wrongExit:null, hint:'액체가 기체로 변하는 현상을 떠올려 봐.', hintDeduct:50 },
      p2:{ id:'p2', step:2, type:'normal', lock:'ox', lines:['문이 열리자 온도계가 놓인 방이 나왔어.','벽에 이런 문장이 적혀 있어.'], msgs:[{speaker:'narrator',type:'text',text:'철문이 스르륵 열리고, 온도계가 잔뜩 놓인 두 번째 방이 나타났다.'},{speaker:'char',type:'text',text:'와, 온도계가 이렇게 많아? 벽에 뭔가 적혀 있는데…'},{speaker:'host',type:'text',text:'벽의 문장이 맞는지 틀린지 판단하면 다음 방으로 갈 수 있어.'},{speaker:'char',type:'text',text:'틀리면 경보가 울린대! 신중하게 골라야 해.'}], q:'“얼음이 녹는 동안 온도는 계속 올라간다.” 맞을까?', oxAnswer:'X', correctExit:'p3', wrongExit:'p8', hint:'상태가 변하는 동안의 온도를 생각해 봐.', hintDeduct:50 },
      p3:{ id:'p3', step:3, type:'normal', lock:'short', lines:['다음 방에는 빈 칸이 있는 팻말이 있어.','비커의 물이 점점 줄어드는 그림도 함께 있어.'], msgs:[{speaker:'host',type:'text',text:'잘했어! 경보 없이 통과했네. 세 번째 방이야.'},{speaker:'narrator',type:'text',text:'방 한가운데에 빈 칸이 뚫린 낡은 팻말이 서 있다. 옆에는 비커의 물이 점점 줄어드는 그림이 그려져 있다.'},{speaker:'char',type:'text',text:'물이 저절로 사라지고 있어… 이런 현상, 과학 시간에 배운 것 같은데?'},{speaker:'host',type:'text',text:'팻말의 빈 칸에 들어갈 두 글자 단어를 입력해 봐.'}], q:'이 현상을 부르는 두 글자 단어를 입력해 줘.', answer:'증발', correctExit:'p4', wrongExit:null, hint:'액체가 기체로 변하는 “ㅈㅂ”.', hintDeduct:50 },
      p4:{ id:'p4', step:4, type:'normal', lock:'order', lines:['실험대 위에 카드가 흩어져 있어.','물을 끓이는 실험 순서를 맞춰야 해.'], msgs:[{speaker:'narrator',type:'text',text:'네 번째 방. 실험대 위에 카드 네 장이 뒤죽박죽 흩어져 있다.'},{speaker:'char',type:'text',text:'카드마다 실험 과정이 하나씩 적혀 있어. 순서가 엉망이야!'},{speaker:'host',type:'text',text:'물을 끓이는 실험이야. 올바른 순서대로 카드를 눌러 정리해 줘.'},{speaker:'char',type:'text',text:'가장 먼저 해야 할 게 뭘까? 침착하게 생각해 보자.'}], q:'올바른 실험 순서대로 카드를 눌러 줘.', orderItems:['비커에 물을 넣는다','알코올램프에 불을 붙인다','물이 끓기 시작한다','수증기가 피어오른다'], orderAnswer:[0,1,2,3], correctExit:'p5', wrongExit:null, hint:'물을 담는 것이 가장 먼저야.', hintDeduct:50 },
      p5:{ id:'p5', step:5, type:'normal', lock:'hotspot', lines:['마지막 방이야! 실험 도구가 잔뜩 놓인 실험대야.','지금 막 반응이 일어나고 있는 지점을 찾아야 문이 열려.'], msgs:[{speaker:'host',type:'text',text:'드디어 마지막 방이야! 조금만 더 힘내자.'},{speaker:'narrator',type:'text',text:'실험 도구가 잔뜩 놓인 커다란 실험대. 어딘가에서 지금 막 화학 반응이 일어나고 있다.'},{speaker:'char',type:'text',text:'보라색 연기가 스멀스멀… 반응이 일어나는 곳을 찾아야 문이 열려!'},{speaker:'host',type:'text',text:'사진을 잘 보고, 반응이 일어나는 정확한 지점을 눌러 봐.'}], q:'사진 속에서 "보라색 용액이 떨어지고 있는 곳"을 찾아 눌러 줘.', img:'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=900&q=80', hotspots:[{x:20,y:66,c:false,label:'빈 시험관'},{x:46,y:47,c:true,label:'용액 떨어지는 곳'},{x:76,y:64,c:false,label:'빈 시험관'}], correctExit:'p6', wrongExit:null, hint:'보라색 액체가 흘러내리는 가운데 지점을 잘 봐.', hintDeduct:50 },
      p6:{ id:'p6', type:'story', lines:['정답이야! 벽이 스르륵 열렸어.','어두운 통로를 따라 조심스럽게 걸어가.','저 끝에 밝은 빛이 보여!'], msgs:[{speaker:'host',type:'text',text:'정답이야! 마지막 자물쇠가 풀렸어!'},{speaker:'narrator',type:'text',text:'벽이 스르륵 열리고, 어두운 통로가 드러났다. 조심스럽게 걸음을 옮긴다.'},{speaker:'char',type:'text',text:'저 끝에 밝은 빛이 보여! 우리… 드디어 나가는 거야!'}], correctExit:'p7' },
      p7:{ id:'p7', type:'ending', endingType:'success', title:'탈출 성공!', body:'마지막 문을 열고 실험실을 무사히 빠져나왔어. 모든 미션을 해결했어!' },
      p8:{ id:'p8', type:'ending', endingType:'fail', title:'탈출 실패', body:'온도 판단을 잘못해 경보가 울리고 문이 잠겨버렸어. 다시 도전해 보자.' },
    },
  };

  // r2~r6: 목록/편집/플레이가 동작하도록 최소 authoring 페이지 (플레이는 pages에서 자동 변환)
  function miniPages(startTitle, startBody, q, choices, okBody, failBody) {
    return [
      { id:'p1', num:1, type:'start',  lock:'mc', title:startTitle, body:startBody, summary:q, x:240, y:60, choices:choices, correctExit:'p2', wrongExit:'p3', points:100, hint:'', hintDeduct:50 },
      { id:'p2', num:2, type:'ending', endingType:'success', title:'탈출 성공!', body:okBody, summary:'탈출에 성공했다', x:120, y:320 },
      { id:'p3', num:3, type:'ending', endingType:'fail', title:'탈출 실패', body:failBody, summary:'탈출에 실패했다', x:380, y:320 },
    ];
  }

  var SEED = [
    { id:'r1', title:'사라진 실험실의 비밀', thumb:'lab',   pin:'834 512', vis:'public',  date:'2026.07.10', order:6, hintPolicy:'deduct', hintCount:2, pages:R1_PAGES, play:R1_PLAY },
    { id:'r2', title:'우주 정거장 탈출',     thumb:'space', pin:'201 946', vis:'public',  date:'2026.07.08', order:5, hintPolicy:'count',  hintCount:3, pages:[
      { id:'p1', num:1, type:'start',  lock:'mc',    title:'정거장 도킹부', body:'산소가 새고 있다. 도킹 코드를 입력해 탈출선을 열어야 한다.', summary:'탈출선을 여는 첫 절차는?', x:240, y:60,  choices:[{t:'해치 압력 균형',c:true},{t:'엔진 점화',c:false},{t:'통신 차단',c:false}], correctExit:'p2', wrongExit:'p5', points:100, hint:'', hintDeduct:50 },
      { id:'p2', num:2, type:'normal', lock:'mc',    title:'제어실 콘솔',   body:'세 개의 스위치가 있다. 올바른 것을 눌러라.', summary:'가장 먼저 눌러야 할 스위치는?', x:240, y:320, choices:[{t:'적색 스위치',c:false},{t:'청색 스위치',c:false},{t:'녹색 스위치',c:false}], correctExit:'p3', wrongExit:'p5', points:100, hint:'', hintDeduct:50 },
      { id:'p3', num:3, type:'normal', lock:'short', title:'산소 밸브',     body:'밸브 코드를 입력하라.', summary:'밸브 코드를 입력하세요', x:240, y:580, answer:'7412', correctExit:'p4', wrongExit:'p4', points:100, hint:'', hintDeduct:50 },
      { id:'p4', num:4, type:'ending', endingType:'success', title:'탈출 성공!', body:'탈출선을 타고 무사히 정거장을 벗어났다!', summary:'탈출에 성공했다', x:520, y:320 },
      { id:'p5', num:5, type:'ending', endingType:'fail',    title:'탈출 실패',   body:'산소가 바닥나 문이 잠겨버렸다.',       summary:'탈출에 실패했다', x:520, y:580 },
      { id:'p6', num:6, type:'normal', lock:'mc',    title:'예비 통신실',   body:'구조 신호를 보낼 수 있다.', summary:'구조 채널 주파수는?', x:800, y:320, choices:[{t:'121.5 MHz',c:true},{t:'88.0 MHz',c:false},{t:'400 MHz',c:false}], correctExit:'p4', wrongExit:'p5', points:100, hint:'', hintDeduct:50 },
    ] },
    { id:'r3', title:'고대 도서관의 암호',   thumb:'book',  pin:'557 038', vis:'private', date:'2026.07.05', order:4, hintPolicy:'free',   hintCount:0, pages:miniPages('먼지 쌓인 서가','금서 서가 앞에 암호가 걸린 책장이 있다. 첫 단서를 찾아라.','책장을 여는 열쇠가 되는 것은?',[{t:'표지의 로마 숫자',c:true},{t:'책 제목',c:false},{t:'저자 이름',c:false}],'비밀 통로가 열리고 도서관을 빠져나왔다!','종이 울리자 서가가 모두 잠겼다.') },
    { id:'r4', title:'해적선의 보물지도',   thumb:'ship',  pin:'642 187', vis:'public',  date:'2026.06.28', order:3, hintPolicy:'deduct', hintCount:2, pages:miniPages('갑판 위','낡은 보물지도의 방향을 읽어 선장실 금고를 열어야 한다.','지도가 가리키는 방향은?',[{t:'북동쪽',c:true},{t:'남서쪽',c:false},{t:'정서쪽',c:false}],'금고를 열고 보물과 함께 탈출했다!','파도에 휩쓸려 지도를 잃어버렸다.') },
    { id:'r5', title:'미래 도시 수사대',     thumb:'space', pin:'913 470', vis:'private', date:'2026.06.20', order:2, hintPolicy:'count',  hintCount:3, pages:miniPages('사건 현장','홀로그램 단서를 분석해 용의자의 이동 경로를 추적하라.','가장 먼저 확인할 단서는?',[{t:'CCTV 로그',c:true},{t:'목격자 진술',c:false},{t:'날씨 기록',c:false}],'용의자를 검거하고 사건을 해결했다!','증거가 사라져 수사가 종결됐다.') },
    { id:'r6', title:'마법 학교 입학시험',   thumb:'lab',   pin:'308 725', vis:'public',  date:'2026.06.15', order:1, hintPolicy:'free',   hintCount:0, pages:miniPages('마법 관문','입학 관문의 룬 문자를 해독해 문을 열어야 한다.','문을 여는 주문은?',[{t:'빛의 룬',c:true},{t:'어둠의 룬',c:false},{t:'물의 룬',c:false}],'관문이 열리고 마법 학교에 입학했다!','주문을 틀려 관문이 닫혀버렸다.') },
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function migrate(rs) {
    // 마이그레이션: 문제 없는 일반 페이지(자물쇠 없음)는 명시적 'desc'(설명형) 타입으로 승격
    rs.forEach(function (r) { (r.pages || []).forEach(function (p) {
      if (p.type === 'normal' && !p.lock) p.type = 'desc';
      if (p.type === 'desc') p.wrongExit = null; // 설명형은 오답 출구 없음
    }); });
    return rs;
  }
  // SEED 콘텐츠 버전. 코드에서 SEED(r1~r6 내용)를 바꿔 강제 반영할 때만 올린다.
  var SEED_VERSION = '2026-07-24.1';
  var VKEY = KEY + '.seedver';
  // 로드 정책: localStorage 에 저장된 데이터를 항상 우선(수정/추가/삭제 모두 유지).
  // 단 SEED_VERSION 이 바뀌면 SEED 방(r1~r6)만 재시딩하고 사용자 생성 방은 보존.
  function load() {
    var seed = clone(SEED);
    var seedIds = {}; seed.forEach(function (r) { seedIds[r.id] = true; });
    var saved = null, savedVer = '';
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) saved = migrate(JSON.parse(raw));
      savedVer = localStorage.getItem(VKEY) || '';
    } catch (e) {}
    if (!saved || !saved.length) return seed;
    if (savedVer !== SEED_VERSION) {
      var userRooms = saved.filter(function (r) { return !seedIds[r.id]; });
      return userRooms.concat(seed);
    }
    return saved;
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(rooms));
      localStorage.setItem(VKEY, SEED_VERSION);
    } catch (e) {}
  }

  var rooms = load();
  persist();

  function countPuzzles(room) {
    return (room.pages || []).filter(function (p) { return (p.type === 'start' || p.type === 'normal') && p.lock; }).length;
  }
  function withDerived(room) { room.puzzles = countPuzzles(room); return room; }

  // lines(화자 없는 평문)만 있는 블록에 msgs를 채워 넣어 정규화 (하위호환)
  function normalizePlayMsgs(sc) {
    Object.keys(sc.pages || {}).forEach(function (k) {
      var b = sc.pages[k];
      if ((b.type === 'normal' || b.type === 'story') && !b.msgs && b.lines) {
        b.msgs = b.lines.map(function (t, i) { return { speaker: (i % 2 ? 'narrator' : 'host'), type: 'text', text: t }; });
      }
    });
    return sc;
  }

  // authoring 페이지 배열 → 플레이 시나리오(객체 map)로 변환
  function toPlay(room) {
    if (room.play) return normalizePlayMsgs(clone(room.play));
    var pages = room.pages || [];
    var map = {}, step = 0;
    var total = pages.filter(function (p) { return (p.type === 'start' || p.type === 'normal') && p.lock; }).length;
    var splitLines = function (t) { return (t || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean); };
    // 화자 포함 말풍선 목록 생성: dialog.blocks 우선(화자 보존), 없으면 body를 host/narrator 교대 텍스트로 폴백
    var msgsOf = function (p) {
      var blocks = p.dialog && p.dialog.blocks;
      if (blocks && blocks.length) {
        return blocks
          .filter(function (b) { return b.type === 'delay' || (b.text && b.text.trim()) || (b.type === 'image' && b.img); })
          .map(function (b) { return { speaker: b.speaker || 'host', type: b.type, text: b.text, img: b.img, delay: b.delay }; });
      }
      return splitLines(p.body).map(function (t, i) { return { speaker: (i % 2 ? 'narrator' : 'host'), type: 'text', text: t }; });
    };
    pages.forEach(function (p) {
      if (p.type === 'ending') { map[p.id] = { id:p.id, type:'ending', endingType:p.endingType, title:p.title, body:p.body }; return; }
      if (p.type === 'desc' || !p.lock) { map[p.id] = { id:p.id, type:'story', lines:splitLines(p.body), msgs:msgsOf(p), correctExit:p.correctExit }; return; }
      step++;
      var b = { id:p.id, step:step, type:'normal', lock:p.lock, lines:splitLines(p.body), msgs:msgsOf(p), q:p.summary || p.title, correctExit:p.correctExit, wrongExit:p.wrongExit, hint:p.hint, hintDeduct:p.hintDeduct };
      if (p.lock === 'mc') b.choices = p.choices || [];
      else if (p.lock === 'ox') b.oxAnswer = p.oxAnswer;
      else if (p.lock === 'short') b.answer = p.answer;
      else if (p.lock === 'order') { b.orderItems = p.orderItems || []; b.orderAnswer = p.orderAnswer || []; }
      else if (p.lock === 'hotspot') { b.hotspots = p.hotspots || []; if (p.img) b.img = p.img; }
      map[p.id] = b;
    });
    var start = pages.find(function (p) { return p.type === 'start'; }) || pages[0];
    return { title:room.title, hintPolicy:room.hintPolicy, hintCount:room.hintCount, startId:start ? start.id : 'p1', total:total, pages:map };
  }

  function nextId() {
    var n = 1; rooms.forEach(function (r) { var m = /^r(\d+)$/.exec(r.id); if (m) n = Math.max(n, parseInt(m[1], 10) + 1); }); return 'r' + n;
  }
  // 참고: 입장 PIN 은 더 이상 방의 것이 아니다(카훗 방식).
  // 참여자는 진행자가 회차를 열 때 발급되는 "세션 PIN"으로만 입장한다 → session-store.js 의 freshPin().
  // 여기 남아 있는 room.pin 은 리포트 등에서 "지난 회차 표기"로만 쓰이는 레거시 값이며,
  // 입장 검증에 쓰면 종료된 회차로도 입장되는 버그가 생기니 절대 쓰지 말 것.
  function randPin() {
    function g() { return Math.floor(Math.random() * 900 + 100); }
    return g() + ' ' + g();
  }

  // 검증: 편집 화면과 동일한 노드 규칙으로 오류/주의 계산
  function pageHasAnswer(p) {
    if (p.type === 'ending' || !p.lock) return true; // 엔딩·설명형(문제 없음)은 정답 불필요
    if (p.lock === 'mc') return (p.choices || []).some(function (c) { return c.c; });
    if (p.lock === 'ox') return p.oxAnswer != null;
    if (p.lock === 'short') return !!(p.answer && String(p.answer).trim());
    return true;
  }
  function validate(room) {
    var pages = room.pages || [];
    var map = {}; pages.forEach(function (p) { map[p.id] = p; });
    var start = pages.find(function (p) { return p.type === 'start'; });
    var seen = new Set(); var stack = start ? [start.id] : [];
    while (stack.length) {
      var id = stack.pop(); if (seen.has(id)) continue; seen.add(id);
      var p = map[id]; if (!p) continue;
      [p.correctExit, p.wrongExit].forEach(function (t) { if (t && !seen.has(t)) stack.push(t); });
    }
    var canEnd = new Set();
    pages.forEach(function (p) { if (p.type === 'ending') canEnd.add(p.id); });
    var changed = true;
    while (changed) {
      changed = false;
      pages.forEach(function (p) {
        if (canEnd.has(p.id)) return;
        var nexts = (p.type === 'desc' || (!p.lock && p.type !== 'ending')) ? [p.correctExit] : [p.correctExit, p.wrongExit];
        if (nexts.some(function (t) { return t && canEnd.has(t); })) { canEnd.add(p.id); changed = true; }
      });
    }
    var hasEnding = pages.some(function (p) { return p.type === 'ending'; });
    var isQ = function (p) { return p.type === 'normal' || p.type === 'start'; };
    var errors = 0, warns = 0;
    pages.forEach(function (p) {
      if (!pageHasAnswer(p) && p.type !== 'ending') errors++;
      if ((isQ(p) || p.type === 'desc') && !p.correctExit) errors++; // 일반(문제)·설명형은 다음(정답) 출구 필수
      if ((p.correctExit && p.correctExit === p.id) || (p.wrongExit && p.wrongExit === p.id)) errors++;
      if (p.correctExit && p.wrongExit && p.correctExit === p.wrongExit) errors++;
      [p.correctExit, p.wrongExit].forEach(function (t) { if (t && t !== p.id && !map[t]) errors++; });
      if (p.type !== 'start' && p.type !== 'ending' && !seen.has(p.id)) warns++;
      if (seen.has(p.id) && p.type !== 'ending' && !canEnd.has(p.id)) warns++;
      if (p.type === 'ending' && !seen.has(p.id)) warns++;
    });
    if (!hasEnding) errors++;
    return { errors: errors, warns: warns, total: errors + warns };
  }

  window.RoomStore = {
    __v: VERSION,      // 싱글턴 가드가 구버전 교체 여부를 판단하는 데 씀
    THUMBS: THUMBS,
    validate: function (id) { var r = typeof id === 'string' ? this.get(id) : id; return validate(r); },
    all: function () { return rooms.map(withDerived); },
    get: function (id) { return withDerived(rooms.find(function (r) { return r.id === id; }) || rooms[0]); },
    toPlay: function (id) { var r = typeof id === 'string' ? this.get(id) : id; return toPlay(r); },
    countPuzzles: countPuzzles,
    // 편집 화면: 방탈출 전체(메타+페이지) 저장
    save: function (room) {
      withDerived(room);
      var i = rooms.findIndex(function (r) { return r.id === room.id; });
      if (i >= 0) rooms[i] = room; else rooms.push(room);
      persist(); return room;
    },
    // 부분 메타 갱신
    saveMeta: function (id, patch) { var r = this.get(id); Object.assign(r, patch); persist(); return r; },
    remove: function (id) { rooms = rooms.filter(function (r) { return r.id !== id; }); persist(); },
    duplicate: function (id) {
      var src = rooms.find(function (r) { return r.id === id; }); if (!src) return null;
      var copy = clone(src); copy.id = nextId(); copy.title = src.title + ' (복사본)'; copy.pin = randPin();
      copy.date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
      copy.order = Math.max.apply(null, rooms.map(function (r) { return r.order || 0; })) + 1;
      if (copy.play) delete copy.play; // 복사본은 pages 기준으로 플레이 파생
      rooms.unshift(copy); persist(); return copy;
    },
    create: function (meta) {
      meta = meta || {};
      var id = nextId();
      var room = {
        id:id, title:meta.title || '새 방탈출', thumb:meta.thumb || 'lab', pin:randPin(), vis:'private', date:new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
        order:Math.max.apply(null, rooms.map(function (r) { return r.order || 0; }).concat([0])) + 1,
        hintPolicy:meta.hintPolicy || 'deduct', hintCount:meta.hintCount || 2,
        // 새 방 첫 페이지는 문제 없는 설명형으로 시작 (내용 편집에서 문제를 추가하면 일반으로 전환)
        pages:[{ id:'p1', num:1, type:'start', title:'첫 페이지', body:'', summary:'', x:240, y:80, correctExit:null, wrongExit:null, points:100, hint:'', hintDeduct:50 }],
      };
      rooms.unshift(room); persist(); return room;
    },
    resetAll: function () { rooms = clone(SEED); persist(); return rooms; },
  };
})();
