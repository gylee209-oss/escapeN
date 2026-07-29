/* 방탈출N 실시간 세션 스토어 — 실시간 모드(A+B: 관제탑 + 부활) 데이터 원천.
   room-store.js 가 "콘텐츠(방)"를 담당하고, 이 파일이 "1회 실행(세션)"을 담당합니다.

   설계 요약
   - 참여자는 각자 자기 노드에서 자유 진행(비동기와 동일한 경로/분기).
   - 진행자는 문제를 진행하지 않고 "관제"만 한다: 정체 감지 · 힌트 뿌리기 · 부활 · 공지 · 일시정지.
   - 실패 엔딩(wrongExit → ending.fail)은 실시간에서 "탈락"이 아니라 "잠깐 멈춤"(부활 가능)이다.

   동기화: localStorage + window 'storage' 이벤트.
   백엔드가 없으므로 같은 브라우저의 다른 탭(진행자 탭 ↔ 참여자 탭)끼리 실제로 동기화됩니다.
   같은 탭 안에서의 변경은 storage 이벤트가 안 오므로 내부 리스너를 직접 호출합니다. */
(function () {
  // 이 파일이 두 번 평가되면(화면 전환 시 helmet 스크립트 재주입 등) 스토어가 두 개 생겨
  // 한쪽 인스턴스에 쓴 변경이 다른 쪽 화면에 안 보이는 문제가 생긴다. 싱글턴으로 고정한다.
  //
  // 단, "이미 올라와 있는 스토어가 구버전"이면 그냥 return 하면 안 된다.
  // (예: 이 파일에 API를 추가했는데 앞서 로드된 구버전 인스턴스가 남아 있으면
  //  새 함수가 없어 `store.xxx is not a function` 으로 깨진다)
  // → 버전을 비교해서, 더 낮은 버전만 올라와 있으면 새 버전으로 교체한다.
  var VERSION = 12;   // API 를 추가/변경하면 이 숫자를 올릴 것
  if (window.SessionStore && (window.SessionStore.__v || 1) >= VERSION) return;

  var KEY = 'bangtalN.sessions.v1';

  // 정체(막힘) 판정 기준: 한 노드에 이 시간 이상 머무르면 진행자 화면에서 경고
  var STUCK_MS = 3 * 60 * 1000;

  function now() { return Date.now(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8) + now().toString(36).slice(-4);
  }

  function loadAll() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  var sessions = loadAll();
  var listeners = [];

  // ---------- 최초 1회 시드 ----------
  // 화면을 처음 열었을 때 빈 목록만 보이면 실시간/미션을 확인할 수 없으므로,
  // r1 = 미션 + 실시간 동시 진행 / r2 = 미션만 / r3 = 종료된 회차 로 예시를 깔아둔다.
  // (사용자가 직접 여닫으면 그 상태가 유지되고, 이 시드는 다시 실행되지 않는다)
  var SEED_KEY = 'bangtalN.sessions.seeded.v4';
  function seedOnce() {
    try {
      if (localStorage.getItem(SEED_KEY)) return;   // 이미 한 번 깔았음
      if (sessions.length) { localStorage.setItem(SEED_KEY, '1'); return; }  // 기존 데이터 보존
      localStorage.setItem(SEED_KEY, '1');
    } catch (e) { return; }
    if (!window.RoomStore) return;

    var MIN = 60000, DAY = 86400000, t = now();
    var NAMES = ['민준','서연','도윤','하은','지호','수아','예준','채원','시우','유진','건우','다은'];

    // 공통: 참여자 만들기 (진행/완주/실패 섞어서)
    function mkPlayers(sc, spec) {
      return spec.map(function (o, i) {
        var p = makePlayer(NAMES[i % NAMES.length], sc);
        p.joinedAt = o.joined;
        p.enteredNodeAt = o.stuckFrom || o.joined;
        p.curId = o.curId;
        p.solved = o.solved;
        p.score = o.score;
        p.hintUsed = o.hint || 0;
        p.wrong = o.wrong || 0;
        p.status = o.status;
        if (o.status === 'done') p.finishedAt = o.joined + o.tookMin * MIN;
        if (o.lastQ) p.lastQuestionId = o.lastQ;
        p.trail = (o.trail || []).map(function (x) { return { pageId: x[0], correct: true, at: o.joined + x[1] * MIN }; });
        return p;
      });
    }

    // ① r1 — 미션(상시) : 지난 3주간 누적 참여
    var sc1 = scenarioOf('r1');
    var r1 = window.RoomStore.get('r1');
    var mission = {
      id: uid('m'), roomId: 'r1', kind: 'mission', title: r1 ? r1.title : '사라진 실험실의 비밀',
      round: 0, seq: 1, dueAt: t + 9 * DAY, pin: r1 ? r1.pin : '834 512', state: 'running', memo: '3반 과제 · 1단원 마무리',
      opts: Object.assign(defaultOpts(), { lateJoin: true, revive: 'self' }),
      createdAt: t - 21 * DAY, startedAt: t - 21 * DAY, endedAt: 0,
      startId: sc1 ? sc1.startId : 'p1', qIds: questionIds(sc1), total: sc1 ? sc1.total : 5,
      players: mkPlayers(sc1, [
        { joined: t - 19 * DAY, curId: 'p7', solved: 5, score: 950, status: 'done', tookMin: 12, hint: 1, trail: [['p1',2],['p2',5],['p3',7],['p4',9],['p5',12]] },
        { joined: t - 16 * DAY, curId: 'p7', solved: 5, score: 850, status: 'done', tookMin: 18, hint: 2, trail: [['p1',3],['p2',7],['p3',10],['p4',14],['p5',18]] },
        { joined: t - 12 * DAY, curId: 'p8', solved: 2, score: 700, status: 'failed', lastQ: 'p2', wrong: 1, trail: [['p1',3],['p2',8]] },
        { joined: t - 6 * DAY,  curId: 'p7', solved: 5, score: 1000, status: 'done', tookMin: 9,  trail: [['p1',1],['p2',3],['p3',5],['p4',7],['p5',9]] },
        { joined: t - 4 * DAY,  curId: 'p4', solved: 3, score: 900, status: 'playing', stuckFrom: t - 4 * DAY, hint: 1, trail: [['p1',2],['p2',5],['p3',8]] },
        { joined: t - 2 * DAY,  curId: 'p7', solved: 5, score: 900, status: 'done', tookMin: 15, hint: 1, trail: [['p1',2],['p2',6],['p3',9],['p4',12],['p5',15]] },
        { joined: t - 1 * DAY,  curId: 'p2', solved: 1, score: 1000, status: 'playing', stuckFrom: t - 1 * DAY, trail: [['p1',3]] },
      ]),
      notice: null, openHints: {},
    };
    sessions.push(mission);

    // ② r1 — 실시간 회차 1(지난주 종료) + 회차 2(지금 진행 중)
    function liveSession(round, pin, startAgo, endAgo, spec) {
      var s = {
        id: uid('s'), roomId: 'r1', title: r1 ? r1.title : '사라진 실험실의 비밀',
        round: round, pin: pin, state: endAgo == null ? 'running' : 'ended',
        opts: defaultOpts(),
        createdAt: t - startAgo, startedAt: t - startAgo, endedAt: endAgo == null ? 0 : t - endAgo,
        startId: sc1 ? sc1.startId : 'p1', qIds: questionIds(sc1), total: sc1 ? sc1.total : 5,
        players: mkPlayers(sc1, spec), notice: null, openHints: {},
      };
      sessions.push(s);
      return s;
    }
    // 회차 1 — 지난주 수업, 종료됨
    liveSession(1, '402 887', 7 * DAY, 7 * DAY - 22 * MIN, [
      { joined: t - 7 * DAY, curId: 'p7', solved: 5, score: 1000, status: 'done', tookMin: 11, trail: [['p1',2],['p2',4],['p3',6],['p4',9],['p5',11]] },
      { joined: t - 7 * DAY, curId: 'p7', solved: 5, score: 900, status: 'done', tookMin: 16, hint: 1, trail: [['p1',3],['p2',6],['p3',9],['p4',13],['p5',16]] },
      { joined: t - 7 * DAY, curId: 'p8', solved: 1, score: 800, status: 'failed', lastQ: 'p2', wrong: 1, trail: [['p1',4]] },
      { joined: t - 7 * DAY, curId: 'p5', solved: 4, score: 850, status: 'playing', hint: 2, trail: [['p1',3],['p2',7],['p3',11],['p4',15]] },
      { joined: t - 7 * DAY, curId: 'p7', solved: 5, score: 950, status: 'done', tookMin: 19, trail: [['p1',2],['p2',6],['p3',10],['p4',15],['p5',19]] },
    ]);
    // 회차 2 — 지금 진행 중 (미션과 동시!)
    liveSession(2, '731 205', 14 * MIN, null, [
      { joined: t - 14 * MIN, curId: 'p4', solved: 3, score: 950, status: 'playing', stuckFrom: t - 7 * MIN, hint: 1, trail: [['p1',2],['p2',5],['p3',8]] },
      { joined: t - 14 * MIN, curId: 'p4', solved: 3, score: 900, status: 'playing', stuckFrom: t - 6 * MIN, trail: [['p1',3],['p2',6],['p3',9]] },
      { joined: t - 13 * MIN, curId: 'p5', solved: 4, score: 1000, status: 'playing', trail: [['p1',1],['p2',4],['p3',7],['p4',10]] },
      { joined: t - 13 * MIN, curId: 'p2', solved: 1, score: 850, status: 'playing', stuckFrom: t - 9 * MIN, hint: 2, trail: [['p1',3]] },
      { joined: t - 12 * MIN, curId: 'p8', solved: 1, score: 800, status: 'failed', lastQ: 'p2', wrong: 1, trail: [['p1',4]] },
      { joined: t - 12 * MIN, curId: 'p3', solved: 2, score: 950, status: 'playing', trail: [['p1',2],['p2',6]] },
      { joined: t - 11 * MIN, curId: 'p7', solved: 5, score: 900, status: 'done', tookMin: 10, hint: 1, trail: [['p1',1],['p2',3],['p3',5],['p4',8],['p5',10]] },
    ]);

    // r1 — 두 번째 미션(다른 반 과제용, 자기 PIN)
    sessions.push({
      id: uid('m'), roomId: 'r1', kind: 'mission', title: r1 ? r1.title : '사라진 실험실의 비밀',
      round: 0, seq: 2, dueAt: t + 3 * DAY, pin: '615 340', state: 'running', memo: '4반 보충 · 마감 임박',
      opts: Object.assign(defaultOpts(), { lateJoin: true, revive: 'self' }),
      createdAt: t - 5 * DAY, startedAt: t - 5 * DAY, endedAt: 0,
      startId: sc1 ? sc1.startId : 'p1', qIds: questionIds(sc1), total: sc1 ? sc1.total : 5,
      players: mkPlayers(sc1, [
        { joined: t - 4 * DAY, curId: 'p7', solved: 5, score: 900, status: 'done', tookMin: 14, hint: 1, trail: [['p1',2],['p2',5],['p3',8],['p4',11],['p5',14]] },
        { joined: t - 2 * DAY, curId: 'p3', solved: 2, score: 950, status: 'playing', stuckFrom: t - 2 * DAY, trail: [['p1',3],['p2',7]] },
      ]),
      notice: null, openHints: {},
    });

    // r1 — 실시간 회차 3 (다른 반, 지금 동시 진행)
    liveSession(3, '958 174', 6 * MIN, null, [
      { joined: t - 6 * MIN, curId: 'p2', solved: 1, score: 1000, status: 'playing', trail: [['p1',2]] },
      { joined: t - 6 * MIN, curId: 'p3', solved: 2, score: 950, status: 'playing', trail: [['p1',1],['p2',4]] },
      { joined: t - 5 * MIN, curId: 'p2', solved: 1, score: 900, status: 'playing', stuckFrom: t - 4 * MIN, hint: 1, trail: [['p1',3]] },
      { joined: t - 5 * MIN, curId: 'p1', solved: 0, score: 1000, status: 'playing', stuckFrom: t - 5 * MIN },
    ]);

    // ③ r2 — 미션만 열려 있음 (자율학습용)
    var sc2 = scenarioOf('r2');
    var r2 = window.RoomStore.get('r2');
    sessions.push({
      id: uid('m'), roomId: 'r2', kind: 'mission', title: r2 ? r2.title : '우주 정거장 탈출',
      round: 0, seq: 1, dueAt: t + 16 * DAY, pin: r2 ? r2.pin : '201 946', state: 'running', memo: '동아리 자율활동',
      opts: Object.assign(defaultOpts(), { lateJoin: true, revive: 'self' }),
      createdAt: t - 9 * DAY, startedAt: t - 9 * DAY, endedAt: 0,
      startId: sc2 ? sc2.startId : 'p1', qIds: questionIds(sc2), total: sc2 ? sc2.total : 4,
      players: mkPlayers(sc2, [
        { joined: t - 8 * DAY, curId: 'p3', solved: 2, score: 950, status: 'done', tookMin: 7, trail: [['p1',3],['p2',7]] },
        { joined: t - 5 * DAY, curId: 'p2', solved: 1, score: 900, status: 'playing', stuckFrom: t - 5 * DAY, trail: [['p1',4]] },
        { joined: t - 3 * DAY, curId: 'p3', solved: 2, score: 1000, status: 'done', tookMin: 5, trail: [['p1',2],['p2',5]] },
      ]),
      notice: null, openHints: {},
    });

    persist();
  }
  seedOnce();

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(sessions)); } catch (e) {}
    emit();
  }
  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }
  // 다른 탭에서의 변경 수신
  try {
    window.addEventListener('storage', function (e) {
      if (e.key !== KEY) return;
      sessions = loadAll();
      emit();
    });
  } catch (e) {}

  // "지금 열려 있는가" 단일 기준: 종료되지 않았고, 미션이면 마감도 안 지났어야 한다
  function isOpen(s) {
    if (!s || s.state === 'ended') return false;
    if (s.kind === 'mission' && s.dueAt && now() > s.dueAt) return false;
    return true;
  }

  function find(id) {
    return sessions.filter(function (s) { return s.id === id; })[0] || null;
  }
  function normPin(pin) { return String(pin || '').replace(/\D/g, ''); }

  // 방별 회차 보관 개수. localStorage 라 무한정 쌓으면 용량이 터진다.
  // 오래된 회차(번호 작은 것)부터 버리고, 진행 중인 회차는 절대 버리지 않는다.
  var KEEP_PER_ROOM = 20;
  function pruneRooms(roomId) {
    var mine = sessions.filter(function (s) { return s.roomId === roomId && s.kind !== 'mission'; });
    if (mine.length <= KEEP_PER_ROOM) return;
    var ended = mine.filter(function (s) { return s.state === 'ended'; })
                    .sort(function (a, b) { return (a.round || 0) - (b.round || 0); });
    var over = mine.length - KEEP_PER_ROOM;
    var drop = {};
    ended.slice(0, over).forEach(function (s) { drop[s.id] = true; });
    sessions = sessions.filter(function (s) { return !drop[s.id]; });
  }

  // 같은 방에 미션이 여러 개일 때 구분용 순번
  function nextMissionSeq(roomId) {
    var n = 0;
    sessions.forEach(function (s) {
      if (s.roomId === roomId && s.kind === 'mission') n = Math.max(n, s.seq || 0);
    });
    return n + 1;
  }

  // 이 방의 다음 회차 번호. 종료된 회차도 세어야 번호가 겹치지 않는다.
  function nextRound(roomId) {
    var n = 0;
    sessions.forEach(function (s) {
      if (s.roomId === roomId && s.kind !== 'mission') n = Math.max(n, s.round || 0);
    });
    return n + 1;
  }

  // 회차 PIN 발급 — 6자리(NNN NNN). 살아있는 다른 세션과 겹치지 않게 뽑는다.
  // (PIN 은 방이 아니라 세션의 것이므로, 종료된 세션의 PIN 은 다시 쓰여도 무해하다)
  function freshPin() {
    function g() { return Math.floor(Math.random() * 900 + 100); }
    for (var i = 0; i < 200; i++) {
      var cand = g() + ' ' + g();
      var taken = sessions.some(function (s) {
        return s.state !== 'ended' && normPin(s.pin) === normPin(cand);
      });
      if (!taken) return cand;
    }
    return g() + ' ' + g();
  }

  // ---------- 시나리오 도우미 (room-store 의 toPlay 결과를 사용) ----------
  function scenarioOf(roomId) {
    if (!window.RoomStore) return null;
    try { return window.RoomStore.toPlay(roomId); } catch (e) { return null; }
  }
  // 문제 페이지들을 "단계 순서"로 정렬해 관제 진도 계산에 사용
  function questionIds(sc) {
    if (!sc) return [];
    return Object.keys(sc.pages)
      .map(function (k) { return sc.pages[k]; })
      .filter(function (p) { return p.type === 'normal' && p.step; })
      .sort(function (a, b) { return a.step - b.step; })
      .map(function (p) { return p.id; });
  }

  // ---------- 기본 옵션 ----------
  function defaultOpts() {
    return {
      lateJoin: true,        // 시작 후 입장 허용
      revive: 'both',        // 'host'(진행자만) | 'self'(스스로) | 'both'
      revivePenalty: 100,    // 부활 시 차감 점수
      speedBonus: true,      // 빨리 풀면 가산점
      nickApproval: false,   // 닉네임 진행자 승인
      timeLimit: 0,          // 세션 전체 제한시간(분). 0 = 무제한
    };
  }

  // ---------- 참여자 ----------
  function makePlayer(name, sc) {
    return {
      id: uid('u'),
      name: name || '게스트',
      curId: sc ? sc.startId : 'p1',
      score: 1000,
      solved: 0,          // 맞힌 문제 수
      wrong: 0,           // 오답 횟수
      hintUsed: 0,
      revived: 0,
      status: 'playing',  // playing | stuck | failed | done
      online: true,
      joinedAt: now(),
      enteredNodeAt: now(),  // 현재 노드 진입 시각 (정체 판정용)
      finishedAt: 0,
      trail: [],          // [{pageId, correct, ms, hintUsed, at}]
    };
  }

  // 파생 상태 계산: 정체 여부 등 (읽을 때마다 갱신)
  function derive(session) {
    var t = now();
    // 미션 마감일이 지났으면 만료로 본다(입장 차단·목록에서 제외)
    session.isExpired = !!(session.kind === 'mission' && session.dueAt && t > session.dueAt);
    (session.players || []).forEach(function (p) {
      p.stuckMs = p.status === 'playing' ? (t - (p.enteredNodeAt || t)) : 0;
      p.isStuck = p.status === 'playing' && p.stuckMs >= STUCK_MS;
    });
    return session;
  }

  // 노드별 참여자 집계 — 진행자 관제 지도의 핵심 데이터
  function nodeCounts(session) {
    var byNode = {};
    (session.players || []).forEach(function (p) {
      if (!byNode[p.curId]) byNode[p.curId] = [];
      byNode[p.curId].push(p);
    });
    return byNode;
  }

  function leaderboard(session) {
    return (session.players || []).slice().sort(function (a, b) {
      if (b.solved !== a.solved) return b.solved - a.solved;
      if (b.score !== a.score) return b.score - a.score;
      return (a.finishedAt || Infinity) - (b.finishedAt || Infinity);
    }).map(function (p, i) { p.rank = i + 1; return p; });
  }

  window.SessionStore = {
    __v: VERSION,          // 싱글턴 가드가 구버전 교체 여부를 판단하는 데 씀
    STUCK_MS: STUCK_MS,
    defaultOpts: defaultOpts,

    // 변경 구독 (진행자·참여자 화면이 이걸로 리렌더)
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },

    all: function () { return sessions.map(derive); },
    get: function (id) { var s = find(id); return s ? derive(s) : null; },

    // PIN 으로 "진행 중인 실시간 세션" 찾기 — 참여자 입장에서 사용
    findByPin: function (pin) {
      var n = normPin(pin);
      var rt = sessions.filter(function (s) {
        return normPin(s.pin) === n && isOpen(s);
      });
      return rt.length ? derive(rt[rt.length - 1]) : null;
    },
    // 방 기준 현재 살아있는 세션
    // 실시간 회차만 (미션 세션은 항상 running 이라 제외해야 한다)
    activeForRoom: function (roomId) {
      var rt = sessions.filter(function (s) {
        return s.roomId === roomId && s.kind !== 'mission' && s.state !== 'ended';
      });
      return rt.length ? derive(rt[rt.length - 1]) : null;
    },

    // ---------- 진행자: 세션 생성/제어 ----------
    // 카훗 방식: PIN 은 방이 아니라 "이 회차(세션)"의 것이다. 세션마다 새로 발급되고
    // 세션이 끝나면 만료돼 재사용되지 않는다 → 지난 회차 PIN 으로는 아무도 못 들어옴.
    // ---------- 미션모드 ----------
    // 실시간(realtime)과 달리 진행자가 없다. 방을 "진행 중"으로 열어두면 참여자가 아무 때나
    // 고정 PIN(=room.pin)으로 들어와 혼자 푼다. 회차 개념이 없으므로 방마다 미션 세션은 하나뿐이고,
    // 참여 기록이 계속 누적된다(리포트는 제작자가 지정한 기간으로 잘라 본다).
    // 방의 현재 열림 상태 — room.status 를 없앴으므로 이 함수가 단일 판단 기준이다.
    // 'realtime'(실시간 회차 진행 중) | 'mission'(미션 상시 열림) | 'closed'(둘 다 없음)
    // 둘 다 열려 있으면 'realtime' 가 우선(지금 수업 중이라는 뜻이 더 급하다).
    roomState: function (roomId) {
      var rt = null, mission = null;
      sessions.forEach(function (s) {
        if (s.roomId !== roomId || !isOpen(s)) return;
        if (s.kind === 'mission') mission = s; else rt = s;
      });
      return {
        kind: rt ? 'realtime' : (mission ? 'mission' : 'closed'),
        realtime: rt ? derive(rt) : null,
        mission: mission ? derive(mission) : null,
        pin: rt ? rt.pin : (mission ? mission.pin : ''),
      };
    },

    // 팝업용: 이 방에서 **지금 열려 있는** 세션 전체 (미션 + 실시간)
    openSessionsFor: function (roomId) {
      return sessions
        .filter(function (s) { return s.roomId === roomId && isOpen(s); })
        .map(function (s) { return derive(s); })
        .sort(function (a, b) {
          // 실시간을 위로, 그 안에서는 최근 시작 순
          var ak = a.kind === 'mission' ? 1 : 0, bk = b.kind === 'mission' ? 1 : 0;
          return ak - bk || (b.startedAt || 0) - (a.startedAt || 0);
        });
    },
    // 그 방의 미션 **전체** (최근 만든 것 먼저). 한 방에 미션을 여러 개 열 수 있으므로
    // 리포트 목록은 이걸 써야 한다 — missionFor() 는 가장 최근 하나만 준다.
    missionsForRoom: function (roomId) {
      return sessions.filter(function (s) { return s.roomId === roomId && s.kind === 'mission'; })
        .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })
        .map(derive);
    },
    // 미션 기간(마감일) 수정 — 생성 후에도 늘리거나 줄일 수 있다.
    // 마감을 미래로 늘리면 만료됐던 미션이 다시 열리고(isOpen), 과거로 줄이면 즉시 만료된다.
    setDueAt: function (sessionId, dueAt) {
      var s = find(sessionId);
      if (!s || s.kind !== 'mission') return null;
      s.dueAt = dueAt || 0;
      persist(); return derive(s);
    },
    // 메모 수정 — 미션 생성 후에도 리포트 목록에서 고칠 수 있다(오타·반 이름 변경 등)
    setMemo: function (sessionId, memo) {
      var s = find(sessionId);
      if (!s) return null;
      s.memo = String(memo || '').slice(0, 60);
      persist(); return derive(s);
    },
    missionFor: function (roomId) {
      var m = sessions.filter(function (s) { return s.roomId === roomId && s.kind === 'mission'; });
      return m.length ? derive(m[m.length - 1]) : null;
    },
    // 미션모드 열기 — 방 status='ing' 로 바꾸고 누적 세션을 만든다(있으면 재사용)
    // opts.dueAt(timestamp) = 종료 예정일. 지나면 자동으로 닫힌 것으로 간주한다(isExpired).
    openMission: function (roomId, opts) {
      // 미션도 여러 개 동시 운영 가능(과제 A·과제 B 등). 매번 새로 만들고 **각자 PIN 을 발급**한다.
      opts = opts || {};
      var room = window.RoomStore ? window.RoomStore.get(roomId) : null;
      var sc = scenarioOf(roomId);
      var s = {
        id: uid('m'), roomId: roomId, kind: 'mission',
        title: room ? room.title : '방탈출',
        round: 0,                                  // 미션은 회차 번호 없음
        seq: nextMissionSeq(roomId),               // 같은 방에 여러 개면 구분용 순번
        dueAt: opts.dueAt || (now() + 14 * 86400000),  // 종료 예정일(기본 2주 뒤)
        memo: opts.memo || '',                     // 이 미션이 어떤 건지(반·과제명 등) — 리포트 목록에 노출
        pin: freshPin(),                           // 미션도 자기 PIN (방 PIN 아님)
        state: 'running',                          // 열려 있는 동안 계속 running
        opts: Object.assign(defaultOpts(), { lateJoin: true, revive: 'self' }),
        createdAt: now(), startedAt: now(), endedAt: 0,
        startId: sc ? sc.startId : 'p1',
        qIds: questionIds(sc), total: sc ? sc.total : 0,
        players: [], notice: null, openHints: {},
      };
      sessions.push(s);
      persist(); return derive(s);
    },
    // 미션모드 닫기 — 기록은 남기고 입장만 막는다
    // 미션이 여러 개일 수 있으므로 세션 id 로 닫는다(roomId 를 주면 가장 최근 것).
    closeMission: function (idOrRoom) {
      var m = find(idOrRoom);
      if (!m) {
        var mine = sessions.filter(function (s) { return s.roomId === idOrRoom && s.kind === 'mission' && s.state !== 'ended'; });
        m = mine.length ? mine[mine.length - 1] : null;
      }
      if (!m) return null;
      m.state = 'ended'; m.endedAt = now();
      persist(); return derive(m);
    },

    create: function (roomId, opts) {
      var room = window.RoomStore ? window.RoomStore.get(roomId) : null;
      var sc = scenarioOf(roomId);
      // 같은 방에 이미 살아있는 세션이 있으면 새로 만들지 않고 그것을 돌려준다(중복 방지)
      // 한 방에서 여러 회차를 동시에 돌릴 수 있다(1반·2반 등) → 중복 차단하지 않는다.
      // 각 회차는 자기 PIN 을 갖고 서로 독립이다.
      var s = {
        id: uid('s'),
        roomId: roomId,
        title: room ? room.title : '방탈출',
        round: nextRound(roomId),  // 이 방에서 몇 번째 회차인지 (1,2,3…) — 리포트 구분용
        pin: freshPin(),           // 회차 전용 1회용 PIN
        state: 'lobby',            // lobby | running | paused | ended
        opts: Object.assign(defaultOpts(), opts || {}),
        createdAt: now(),
        startedAt: 0,
        endedAt: 0,
        startId: sc ? sc.startId : 'p1',
        qIds: questionIds(sc),
        total: sc ? sc.total : 0,
        players: [],
        notice: null,              // {text, at} 전체 공지
        openHints: {},             // {pageId: true} 진행자가 전체 공개한 힌트
      };
      sessions.push(s);
      pruneRooms(roomId);   // 회차가 무한정 쌓이지 않게 오래된 것부터 정리
      persist();
      return derive(s);
    },
    start: function (id) {
      var s = find(id); if (!s) return null;
      s.state = 'running'; s.startedAt = now();
      s.players.forEach(function (p) { p.enteredNodeAt = now(); });
      persist(); return derive(s);
    },
    pause: function (id) {
      var s = find(id); if (!s) return null;
      s.state = 'paused'; s.pausedAt = now();
      persist(); return derive(s);
    },
    resume: function (id) {
      var s = find(id); if (!s) return null;
      // 멈춰 있던 시간은 정체 판정에서 제외
      var delta = s.pausedAt ? (now() - s.pausedAt) : 0;
      s.players.forEach(function (p) { if (p.enteredNodeAt) p.enteredNodeAt += delta; });
      s.state = 'running'; s.pausedAt = 0;
      persist(); return derive(s);
    },
    // 세션 종료 = 이 회차 PIN 만료. 이후 이 PIN 으로는 아무도 입장하지 못한다.
    end: function (id) {
      var s = find(id); if (!s) return null;
      s.state = 'ended'; s.endedAt = now();
      persist(); return derive(s);
    },

    // 세션 옵션 부분 갱신 (대기실 스위치)
    setOpts: function (id, patch) {
      var s = find(id); if (!s) return null;
      Object.assign(s.opts, patch || {});
      persist(); return derive(s);
    },

    // 전체 공지
    notify: function (id, text) {
      var s = find(id); if (!s) return null;
      s.notice = { text: text, at: now() };
      persist(); return derive(s);
    },
    clearNotice: function (id) {
      var s = find(id); if (!s) return null;
      s.notice = null; persist(); return derive(s);
    },
    // 특정 문제의 힌트를 전원에게 공개 (정체 구간 구조용)
    openHint: function (id, pageId) {
      var s = find(id); if (!s) return null;
      s.openHints[pageId] = true;
      persist(); return derive(s);
    },

    // 부활: 실패 엔딩에 갇힌 참여자를 지정 노드로 되돌림
    revive: function (id, playerId, toPageId) {
      var s = find(id); if (!s) return null;
      var p = (s.players || []).filter(function (x) { return x.id === playerId; })[0];
      if (!p) return derive(s);
      p.curId = toPageId || p.lastQuestionId || s.startId;
      p.status = 'playing';
      p.score = Math.max(0, p.score - (s.opts.revivePenalty || 0));
      p.revived++;
      p.enteredNodeAt = now();
      persist(); return derive(s);
    },
    // 실패자 전원 부활
    reviveAll: function (id) {
      var s = find(id); if (!s) return null;
      var self = this;
      (s.players || []).filter(function (p) { return p.status === 'failed'; })
        .forEach(function (p) { self.revive(id, p.id, p.lastQuestionId); });
      return derive(find(id));
    },
    kick: function (id, playerId) {
      var s = find(id); if (!s) return null;
      s.players = s.players.filter(function (p) { return p.id !== playerId; });
      persist(); return derive(s);
    },

    // ---------- 참여자 ----------
    join: function (pin, name) {
      var s = this.findByPin(pin);
      if (!s) return { error: 'no-session' };
      var raw = find(s.id);
      if (raw.state === 'running' && !raw.opts.lateJoin) return { error: 'late' };
      if (raw.state === 'ended') return { error: 'ended' };
      var sc = scenarioOf(raw.roomId);
      var p = makePlayer(name, sc);
      raw.players.push(p);
      persist();
      return { sessionId: raw.id, playerId: p.id };
    },
    player: function (id, playerId) {
      var s = this.get(id); if (!s) return null;
      return (s.players || []).filter(function (p) { return p.id === playerId; })[0] || null;
    },
    // 참여자 진행 상황 보고 — 참여자 플레이 화면이 노드 이동 시마다 호출
    // patch: { curId, score, correct, hintUsed, isFail, isDone, lastQuestionId }
    progress: function (id, playerId, patch) {
      var s = find(id); if (!s) return null;
      var p = (s.players || []).filter(function (x) { return x.id === playerId; })[0];
      if (!p) return derive(s);
      patch = patch || {};
      if (patch.lastQuestionId) p.lastQuestionId = patch.lastQuestionId;
      if (typeof patch.score === 'number') p.score = patch.score;
      if (patch.correct === true) p.solved++;
      if (patch.correct === false) p.wrong++;
      if (patch.hintUsed) p.hintUsed++;
      if (patch.curId && patch.curId !== p.curId) {
        p.trail.push({ pageId: p.curId, correct: patch.correct, at: now() });
        p.curId = patch.curId;
        p.enteredNodeAt = now();
      }
      if (patch.isFail) { p.status = 'failed'; }
      else if (patch.isDone) { p.status = 'done'; p.finishedAt = now(); }
      else if (p.status === 'failed' || p.status === 'done') { p.status = 'playing'; }
      p.online = true;
      persist(); return derive(s);
    },
    heartbeat: function (id, playerId) {
      var s = find(id); if (!s) return null;
      var p = (s.players || []).filter(function (x) { return x.id === playerId; })[0];
      if (p) { p.online = true; p.seenAt = now(); persist(); }
      return derive(s);
    },
    setOffline: function (id, playerId) {
      var s = find(id); if (!s) return null;
      var p = (s.players || []).filter(function (x) { return x.id === playerId; })[0];
      if (p) { p.online = false; persist(); }
      return derive(s);
    },

    // ---------- 관제 계산 ----------
    nodeCounts: function (id) { var s = this.get(id); return s ? nodeCounts(s) : {}; },
    leaderboard: function (id) { var s = this.get(id); return s ? leaderboard(s) : []; },
    // 진행자 화면 상단 요약
    stats: function (id) {
      var s = this.get(id); if (!s) return null;
      var ps = s.players || [];
      return {
        total: ps.length,
        online: ps.filter(function (p) { return p.online; }).length,
        playing: ps.filter(function (p) { return p.status === 'playing'; }).length,
        stuck: ps.filter(function (p) { return p.isStuck; }).length,
        failed: ps.filter(function (p) { return p.status === 'failed'; }).length,
        done: ps.filter(function (p) { return p.status === 'done'; }).length,
        avgSolved: ps.length ? Math.round(ps.reduce(function (a, p) { return a + p.solved; }, 0) / ps.length * 10) / 10 : 0,
      };
    },

    remove: function (id) {
      sessions = sessions.filter(function (s) { return s.id !== id; });
      persist();
    },
    resetAll: function () { sessions = []; persist(); },

    // ---------- 리포트 ----------
    // 한 방의 회차 목록 (최신 회차 먼저). 리포트 목록 화면이 이걸로 그린다.
    roundsForRoom: function (roomId) {
      return sessions
        .filter(function (s) { return s.roomId === roomId && s.kind !== 'mission'; })
        .slice()
        .sort(function (a, b) { return (b.round || 0) - (a.round || 0); })
        .map(function (s) { return derive(s); });
    },
    // 방의 가장 최근 회차 (?id= 로만 들어온 링크를 살려주기 위함)
    latestForRoom: function (roomId) {
      var list = this.roundsForRoom(roomId);
      return list.length ? list[0] : null;
    },

    // 세션 하나를 리포트용 데이터로 변환 — 더미가 아니라 실제 플레이 기록에서 만든다.
    // 문제별 정답률은 players[].trail(문제별 통과 기록)을 집계해 계산한다.
    // opts.from / opts.to (timestamp) 를 주면 그 기간에 참여한 사람만 집계한다.
    // 미션모드는 회차가 없어 기록이 계속 누적되므로, 제작자가 기간을 지정해 잘라 본다.
    report: function (id, opts) {
      var s = find(id); if (!s) return null;
      derive(s);
      opts = opts || {};
      var room = window.RoomStore ? window.RoomStore.get(s.roomId) : null;
      var pages = (room && room.pages) || [];
      // 문제(자물쇠 있는 start/normal) 목록을 순서대로
      var qs = pages.filter(function (p) {
        return (p.type === 'normal' || p.type === 'start') && p.lock;
      });
      var qIndex = {}; qs.forEach(function (p, i) { qIndex[p.id] = i; });

      var inRange = function (p) {
        var t = p.joinedAt || s.startedAt || 0;
        if (opts.from && t < opts.from) return false;
        if (opts.to && t > opts.to) return false;
        return true;
      };
      var players = (s.players || []).filter(inRange).map(function (p) {
        // trail 에서 문제별 시도를 뽑는다 (pageId 가 문제인 것만)
        var perQ = qs.map(function () { return { tried: false, correct: false, ms: 0 }; });
        var prevAt = s.startedAt || p.joinedAt || 0;
        (p.trail || []).forEach(function (t) {
          var i = qIndex[t.pageId];
          if (i == null) { prevAt = t.at; return; }
          perQ[i].tried = true;
          if (t.correct) perQ[i].correct = true;
          perQ[i].ms = Math.max(0, t.at - prevAt);
          prevAt = t.at;
        });
        // 개인 소요 시간의 기준점:
        //  · 실시간 = 회차 시작 시각(모두 같은 출발선)
        //  · 미션   = **그 사람이 입장한 시각**(아무 때나 들어오므로 세션 시작을 쓰면 엉뚱해진다)
        var base = s.kind === 'mission'
          ? (p.joinedAt || s.startedAt || now())
          : (s.startedAt || p.joinedAt || now());
        var elapsed = (p.finishedAt || s.endedAt || now()) - base;
        return {
          id: p.id, name: p.name, score: p.score,
          solved: p.solved, wrong: p.wrong, hintUsed: p.hintUsed, revived: p.revived,
          status: p.status,               // playing | failed | done
          curId: p.curId,
          elapsedMs: Math.max(0, elapsed),
          perQ: perQ,
        };
      });

      // 문제별 통계 (통과 인원 / 정답률 / 평균 소요)
      var perQuestion = qs.map(function (p, i) {
        var tried = players.filter(function (x) { return x.perQ[i].tried; });
        var ok = tried.filter(function (x) { return x.perQ[i].correct; });
        var msList = ok.map(function (x) { return x.perQ[i].ms; }).filter(function (v) { return v > 0; });
        var avg = msList.length ? Math.round(msList.reduce(function (a, v) { return a + v; }, 0) / msList.length) : 0;
        return {
          id: p.id, num: p.num || (i + 1), title: p.title || '', lock: p.lock,
          triedN: tried.length, okN: ok.length,
          rate: tried.length ? Math.round(ok.length / tried.length * 100) : 0,
          avgMs: avg,
        };
      });

      var doneN = players.filter(function (p) { return p.status === 'done'; }).length;
      return {
        sid: s.id, roomId: s.roomId, title: s.title, round: s.round || 1, pin: s.pin,
        kind: s.kind || 'realtime',
        seq: s.seq || 1,        // 미션이 여러 개일 때 몇 번째 미션인지
        memo: s.memo || '',
        from: opts.from || 0, to: opts.to || 0,
        allPlayerN: (s.players || []).length,   // 기간 필터 전 전체 인원
        state: s.state, startedAt: s.startedAt, endedAt: s.endedAt,
        dueAt: s.dueAt || 0,    // 미션 마감 예정일(기간 표기용)
        durationMs: Math.max(0, (s.endedAt || now()) - (s.startedAt || now())),
        total: s.total || qs.length,
        playerN: players.length,
        doneN: doneN,
        completion: players.length ? Math.round(doneN / players.length * 100) : 0,
        avgScore: players.length ? Math.round(players.reduce(function (a, p) { return a + p.score; }, 0) / players.length) : 0,
        players: players,
        perQuestion: perQuestion,
      };
    },

    // 데모용: 가상 참여자 채워넣기 (프로토타입 시연 — 실제 서비스에선 미사용)
    seedDemo: function (id, count) {
      var s = find(id); if (!s) return null;
      var NAMES = ['민준','서연','도윤','하은','지호','수아','예준','채원','시우','유진','건우','다은','준우','소율','현우','나윤','태윤','지우','시윤','아린','준서','서윤','민재','하린'];
      var sc = scenarioOf(s.roomId);
      var qs = s.qIds && s.qIds.length ? s.qIds : (sc ? questionIds(sc) : []);
      var n = Math.min(count || 12, NAMES.length);
      for (var i = 0; i < n; i++) {
        var p = makePlayer(NAMES[i], sc);
        // 진도를 흩어놓아 관제 지도가 의미 있게 보이도록
        var at = Math.floor(Math.random() * (qs.length + 1));
        p.curId = qs[Math.min(at, qs.length - 1)] || s.startId;
        p.solved = at;
        p.score = 1000 - Math.floor(Math.random() * 4) * 50;
        p.lastQuestionId = p.curId;
        p.enteredNodeAt = now() - Math.floor(Math.random() * 5 * 60 * 1000);
        if (Math.random() < 0.15) { p.status = 'failed'; }
        s.players.push(p);
      }
      persist(); return derive(s);
    },
  };
})();
