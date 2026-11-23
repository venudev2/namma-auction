import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countAuctionTeams,
  finalizedLotRecoveryDelay,
  generatePlayerOrder,
  getNextBidAmount,
  getSquadConstraintError,
  getStartDisposition,
  mapRoomPlayers,
  mergeRoomPlayer,
  normalizePlayerOrder,
  resolveDisconnectAction,
  shouldArmDisconnectPause,
  getPlayerDynamicRating,
  canTeamUseRTM,
  getPlayerOriginalTeam,
  generateRoomRatingDeltas,
} from '../src/lib/auctionRules.js';
import { localAuctionReducer } from '../src/lib/localAuctionEngine.js';
import { pausedRemainingMs } from '../src/lib/auctionDisplay.js';
import { IPL_PLAYERS } from '../src/data/players.js';
import {
  transactBid,
  transactRoomPlayersSale,
  transactSale,
  transactTeamSale,
} from '../src/lib/auctionTransactions.js';
import { createServerSessionTracker } from '../src/lib/serverSessions.js';

const biddingLot = (overrides = {}) => ({
  status: 'bidding',
  playerId: 'p-current',
  currentBid: 0,
  highBidderId: '',
  timerEndsAt: 10_000,
  ...overrides,
});

test('a delayed bid click cannot land on the next lot', () => {
  const lotAfterAdvance = biddingLot({ playerId: 'p-next' });

  const result = transactBid(lotAfterAdvance, {
    userId: 'manager-1',
    userName: 'Manager',
    teamId: 'MI',
    playerId: 'p-old',
    now: 5_000,
    timerMs: 10_000,
    budget: 120,
    basePrice: 2,
  });

  assert.equal(result, undefined, 'transaction must abort when the playerId changed');
});

test('mega player order contains every modern player exactly once', () => {
  const modernPlayers = IPL_PLAYERS.filter((p) => p.set !== 'Legends');
  const order = generatePlayerOrder('mega');
  assert.equal(order.length, modernPlayers.length);
  assert.equal(new Set(order).size, modernPlayers.length);
});

test('selective player order only includes players from selected tiers', () => {
  const selectedSets = ['Tier 1', 'Tier 2'];
  const expectedPlayers = IPL_PLAYERS.filter((p) => p.set !== 'Legends' && selectedSets.includes(p.set));
  const order = generatePlayerOrder('mega', selectedSets);
  assert.equal(order.length, expectedPlayers.length);
  assert.equal(new Set(order).size, expectedPlayers.length);
  order.forEach((idx) => {
    assert.ok(selectedSets.includes(IPL_PLAYERS[idx].set));
  });
});

test('selected tier player order is sequentially ordered by tier (Tier 1 first, then Tier 2), internally shuffled per tier, with zero mixing across tiers', () => {
  const selectedSets = ['Tier 1', 'Tier 2'];
  const order = generatePlayerOrder('mega', selectedSets);
  const t1Indices = new Set(IPL_PLAYERS.map((p, i) => (p.set === 'Tier 1' || p.tier === 'Tier 1' ? i : -1)).filter(i => i >= 0));
  const t2Indices = new Set(IPL_PLAYERS.map((p, i) => (p.set === 'Tier 2' || p.tier === 'Tier 2' ? i : -1)).filter(i => i >= 0));
  const t3Indices = new Set(IPL_PLAYERS.map((p, i) => (p.set === 'Tier 3' || p.tier === 'Tier 3' ? i : -1)).filter(i => i >= 0));

  // Zero Tier 3 players
  const hasTier3 = order.some(idx => t3Indices.has(idx));
  assert.equal(hasTier3, false, 'No Tier 3 player should appear when only Tier 1 & 2 are selected');

  // Verify Tier 1 players all display first, followed by Tier 2, never mixing
  const firstT2Index = order.findIndex(idx => t2Indices.has(idx));
  const lastT1Index = order.findLastIndex(idx => t1Indices.has(idx));
  assert.ok(lastT1Index < firstT2Index, 'All Tier 1 players must display before any Tier 2 player begins');

  // Verify each tier is internally shuffled across multiple auction generations
  const order2 = generatePlayerOrder('mega', selectedSets);
  const t1Order1 = order.filter(idx => t1Indices.has(idx));
  const t1Order2 = order2.filter(idx => t1Indices.has(idx));
  assert.notDeepEqual(t1Order1, t1Order2, 'Tier 1 players must be internally shuffled across auctions');

  const t2Order1 = order.filter(idx => t2Indices.has(idx));
  const t2Order2 = order2.filter(idx => t2Indices.has(idx));
  assert.notDeepEqual(t2Order1, t2Order2, 'Tier 2 players must be internally shuffled across auctions');
});

test('virat kohli rating is set to 89', () => {
  const vk = IPL_PLAYERS.find((p) => p.name === 'Virat Kohli');
  assert.ok(vk, 'Virat Kohli must exist');
  assert.equal(vk.rating, 89);
});

test('90 lots option and custom lots option generate balanced, exciting auction lots', () => {
  const selectedSets = ['Tier 1', 'Tier 2'];
  
  // Test 90 lots
  const order90 = generatePlayerOrder('mega', selectedSets, 90);
  assert.equal(order90.length, 90);
  assert.equal(new Set(order90).size, 90);

  // Verify role balance in 90 lots
  const roles = { 'Wicket-Keeper': 0, 'Batsman': 0, 'All-Rounder': 0, 'Bowler': 0 };
  order90.forEach((idx) => {
    roles[IPL_PLAYERS[idx].role] = (roles[IPL_PLAYERS[idx].role] || 0) + 1;
  });
  assert.ok(roles['Wicket-Keeper'] >= 5, 'Must have at least 5 WKs');
  assert.ok(roles['Batsman'] >= 15, 'Must have at least 15 Batsmen');
  assert.ok(roles['All-Rounder'] >= 15, 'Must have at least 15 All-Rounders');
  assert.ok(roles['Bowler'] >= 20, 'Must have at least 20 Bowlers');

  // Verify Lot 1 is a marquee star
  const opener = IPL_PLAYERS[order90[0]];
  assert.ok(opener.rating >= 78 || opener.tier === 'Tier 1', 'Lot 1 must be a marquee superstar');

  // Test custom lots: 60 lots
  const order60 = generatePlayerOrder('mega', selectedSets, 60);
  assert.equal(order60.length, 60);
  assert.equal(new Set(order60).size, 60);

  // Test custom lots: 25 lots
  const order25 = generatePlayerOrder('mega', selectedSets, 25);
  assert.equal(order25.length, 25);
  assert.equal(new Set(order25).size, 25);
});

test('normalizePlayerOrder converts arrays and Firebase RTDB objects into number arrays', () => {
  assert.deepEqual(normalizePlayerOrder([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(normalizePlayerOrder({ '0': 5, '1': 10, '2': 15 }), [5, 10, 15]);
  assert.deepEqual(normalizePlayerOrder(null), []);
});

test('legends player order contains every legend player exactly once', () => {
  const legendPlayers = IPL_PLAYERS.filter((p) => p.set === 'Legends');
  const indianLegends = legendPlayers.filter((p) => p.type === 'Indian');
  const order = generatePlayerOrder('legends');
  assert.equal(order.length, legendPlayers.length);
  assert.equal(new Set(order).size, legendPlayers.length);
  assert.ok(indianLegends.length >= 70, `must have at least 70 Indian players for 10-team 11-man squads, got ${indianLegends.length}`);
});

test('team count includes human and bot franchises, not teamless spectators', () => {
  assert.equal(countAuctionTeams([]), 0);
  assert.equal(countAuctionTeams([{ id: 'host', team: 'MI' }]), 1);
  assert.equal(
    countAuctionTeams([
      { id: 'host', team: 'MI' },
      { id: 'bot_CSK', team: 'CSK', isBot: true },
    ]),
    2,
  );
  assert.equal(
    countAuctionTeams([
      { id: 'host', team: 'MI' },
      { id: 'spectator', team: '' },
    ]),
    1,
  );
});

test('opening bid uses base price and later increments stay rounded', () => {
  assert.equal(getNextBidAmount({ basePrice: 2 }, 0), 2);

  const atEdge = transactBid(biddingLot({ currentBid: 4.8 }), {
    userId: 'manager-1',
    userName: 'Manager',
    teamId: 'MI',
    playerId: 'p-current',
    now: 5_000,
    timerMs: 10_000,
    budget: 120,
    basePrice: 2,
  });
  assert.equal(atEdge.currentBid, 5);
  assert.equal(transactBid({ ...atEdge, highBidderId: 'other' }, {
    userId: 'manager-1',
    userName: 'Manager',
    teamId: 'MI',
    playerId: 'p-current',
    now: 5_000,
    timerMs: 10_000,
    budget: 120,
    basePrice: 2,
  }).currentBid, 5.25);
});

test('auction start is idempotent for running and completed rooms', () => {
  assert.equal(getStartDisposition(null, null), 'missing');
  assert.equal(getStartDisposition({ status: 'waiting' }, null), 'start');
  assert.equal(getStartDisposition({ status: 'active' }, null), 'resume');
  assert.equal(
    getStartDisposition({ status: 'active' }, biddingLot()),
    'running',
    'an already live lot must never be restarted',
  );
  assert.equal(getStartDisposition({ status: 'completed' }, null), 'completed');
  assert.equal(
    getStartDisposition({ status: 'active' }, { status: 'completed' }),
    'completed',
    'a completed live lot must not be restarted from the first player',
  );
});

test('finalized lots get a recovery window longer than the normal display wait', () => {
  assert.equal(finalizedLotRecoveryDelay('sold'), 6000);
  assert.equal(finalizedLotRecoveryDelay('unsold'), 3000);
  assert.equal(finalizedLotRecoveryDelay('bidding'), null);
});

test('re-joining a room preserves spent and squad count and keeps other managers', () => {
  const players = [
    { id: 'manager-1', name: 'Old', spent: 18, squadCount: 2, isHost: true },
    { id: 'manager-2', name: 'Other', spent: 3, squadCount: 1 },
  ];

  const merged = mergeRoomPlayer(players, {
    id: 'manager-1',
    name: 'New',
    team: 'CSK',
  });

  assert.equal(merged.length, 2);
  const rejoin = merged.find((player) => player.id === 'manager-1');
  assert.equal(rejoin.spent, 18);
  assert.equal(rejoin.squadCount, 2);
  assert.equal(rejoin.isHost, true, 'existing host flag must survive a re-join');
  assert.ok(merged.some((player) => player.id === 'manager-2'));
});

test('roster helper accepts both RTDB arrays and keyed objects', () => {
  assert.deepEqual(mapRoomPlayers(['a', 'b'], (value) => value.toUpperCase()), ['A', 'B']);
  assert.deepEqual(mapRoomPlayers({ 0: 'a', 1: 'b' }, (value) => value.toUpperCase()), ['A', 'B']);
  assert.deepEqual(mapRoomPlayers(null, (value) => value), []);
});

test('team sale is idempotent for a duplicate delayed recovery', () => {
  const once = transactTeamSale(null, {
    roomId: 'room-1',
    playerId: 'p-1',
    bid: 10,
    winnerId: 'manager-1',
    winnerTeamId: 'MI',
    winnerName: 'MI',
    initialBudget: 120,
  });
  assert.equal(once.spent, 10);
  assert.equal(once.budgetRemaining, 110);

  const twice = transactTeamSale(once, {
    roomId: 'room-1',
    playerId: 'p-1',
    bid: 10,
    winnerId: 'manager-1',
    winnerTeamId: 'MI',
    winnerName: 'MI',
    initialBudget: 120,
  });
  assert.equal(twice, once, 'a repeated sale of the same player is a no-op');
  assert.equal(twice.squad.length, 1);
});

test('room stats never regress when a stale sale is recovered late', () => {
  const room = {
    players: [{ id: 'manager-1', spent: 25, squadCount: 2 }],
  };

  const updated = transactRoomPlayersSale(room, {
    winnerId: 'manager-1',
    totalSpent: 10,
    squadCount: 1,
  });

  assert.equal(updated.players[0].spent, 25);
  assert.equal(updated.players[0].squadCount, 2);
});

test('sale transaction only commits after the timer expires', () => {
  const lot = biddingLot({ currentBid: 10, highBidderId: 'manager-1', timerEndsAt: 10_000 });

  assert.equal(transactSale(lot, 9_999), undefined);
  assert.equal(transactSale(lot, 10_000).status, 'sold');
  assert.equal(transactSale(biddingLot({ timerEndsAt: 0 }), 1).status, 'unsold');
});

test('squad and overseas limits block an invalid winning bid', () => {
  const indian = { id: 'p-ind', country: 'IND' };
  const overseas = { id: 'p-aus', country: 'AUS' };
  const playerIndex = [indian, overseas];

  assert.equal(
    getSquadConstraintError({ team: null, player: indian, playerIndex }),
    'Pick a team before bidding',
  );
  assert.equal(
    getSquadConstraintError({
      team: { squad: [{ id: 'p-ind' }] },
      player: indian,
      playerIndex,
    }),
    'This player is already in your squad',
  );
  assert.equal(
    getSquadConstraintError({
      team: { squad: [{ id: 'a' }] },
      player: overseas,
      squadLimit: 1,
      playerIndex,
    }),
    'Squad is full',
  );
  assert.equal(
    getSquadConstraintError({
      team: { squad: [{ id: 'p-other' }] },
      player: overseas,
      overseasLimit: 1,
      playerIndex,
    }),
    'Overseas player limit reached',
  );
  assert.equal(
    getSquadConstraintError({
      team: { squad: [] },
      player: overseas,
      overseasLimit: 8,
      playerIndex,
    }),
    null,
  );
});

test('closing a room on a server with another live session keeps the socket online', () => {
  const sessions = createServerSessionTracker();

  sessions.acquire('primary');
  sessions.acquire('primary');
  sessions.release('primary');
  assert.equal(sessions.has('primary'), true, 'the next room still needs this socket');

  sessions.release('primary');
  assert.equal(sessions.has('primary'), false);
  assert.equal(sessions.size(), 0);
});

test('server-side disconnect auto-pause: arms only for connected host primary tab during bidding', () => {
  const base = {
    socketConnected: true,
    isHost: true,
    isPrimaryTab: true,
    roomStatus: 'active',
    liveStatus: 'bidding',
    playerId: 'p-1',
  };

  assert.equal(shouldArmDisconnectPause(base), true, 'must arm when all conditions met');

  assert.equal(shouldArmDisconnectPause({ ...base, socketConnected: false }), false, 'must not arm when disconnected');
  assert.equal(shouldArmDisconnectPause({ ...base, isHost: false }), false, 'must not arm for non-host');
  assert.equal(shouldArmDisconnectPause({ ...base, isPrimaryTab: false }), false, 'must not arm for secondary host tab');
  assert.equal(shouldArmDisconnectPause({ ...base, roomStatus: 'waiting' }), false, 'must not arm in lobby');
  assert.equal(shouldArmDisconnectPause({ ...base, roomStatus: 'completed' }), false, 'must not arm when auction completed');
  assert.equal(shouldArmDisconnectPause({ ...base, liveStatus: 'paused' }), false, 'must not arm when already paused');
  assert.equal(shouldArmDisconnectPause({ ...base, liveStatus: 'sold' }), false, 'must not arm when lot sold');
  assert.equal(shouldArmDisconnectPause({ ...base, liveStatus: 'unsold' }), false, 'must not arm when lot unsold');
  assert.equal(shouldArmDisconnectPause({ ...base, liveStatus: 'completed' }), false, 'must not arm when lot completed');
  assert.equal(shouldArmDisconnectPause({ ...base, playerId: null }), false, 'must not arm without valid player');
});

test('server-side disconnect auto-pause: lifecycle actions prevent stale operations and re-arm on lot change', () => {
  // Fresh arm
  assert.equal(
    resolveDisconnectAction({
      shouldArm: true,
      currentlyArmed: false,
      armedLotId: null,
      currentLotId: 'p-1',
    }),
    'arm',
  );

  // Already armed for same player -> no-op
  assert.equal(
    resolveDisconnectAction({
      shouldArm: true,
      currentlyArmed: true,
      armedLotId: 'p-1',
      currentLotId: 'p-1',
    }),
    'none',
  );

  // Advanced to next player -> must re-arm (cancel old, arm new)
  assert.equal(
    resolveDisconnectAction({
      shouldArm: true,
      currentlyArmed: true,
      armedLotId: 'p-1',
      currentLotId: 'p-2',
    }),
    'rearm',
  );

  // Status became paused/sold/completed -> cancel armed operation
  assert.equal(
    resolveDisconnectAction({
      shouldArm: false,
      currentlyArmed: true,
      armedLotId: 'p-1',
      currentLotId: 'p-1',
    }),
    'cancel',
  );

  // Already not armed -> no-op
  assert.equal(
    resolveDisconnectAction({
      shouldArm: false,
      currentlyArmed: false,
      armedLotId: null,
      currentLotId: 'p-1',
    }),
    'none',
  );
});

test('server-side disconnect auto-pause: preserved remaining time derived accurately from pausedAt', () => {
  // Server disconnect pause sets pausedAt
  const disconnectPausedLive = {
    status: 'paused',
    timerEndsAt: 25000,
    pausedAt: 17000,
    playerId: 'p-1',
  };
  assert.equal(pausedRemainingMs(disconnectPausedLive), 8000, 'must accurately derive remainingMs from timerEndsAt - pausedAt');

  // Disconnect after expiration clamps cleanly to 0
  const expiredDisconnectLive = {
    status: 'paused',
    timerEndsAt: 10000,
    pausedAt: 12000,
    playerId: 'p-1',
  };
  assert.equal(pausedRemainingMs(expiredDisconnectLive), 0, 'expired timer must clamp to 0');

  // Manual pause priority: explicit remainingMs takes precedence
  const manualPausedLive = {
    status: 'paused',
    remainingMs: 5500,
    timerEndsAt: 25000,
    pausedAt: 17000,
  };
  assert.equal(pausedRemainingMs(manualPausedLive), 5500, 'explicit remainingMs takes precedence over pausedAt');
});

test('user requested player rating adjustments match exactly', () => {
  const bumrah = IPL_PLAYERS.find(p => p.name === 'Jasprit Bumrah');
  const dhoni = IPL_PLAYERS.find(p => p.name === 'Mahendra Singh Dhoni');
  const siraj = IPL_PLAYERS.find(p => p.name === 'Mohammed Siraj');
  const arshdeep = IPL_PLAYERS.find(p => p.name === 'Arshdeep Singh');
  const shami = IPL_PLAYERS.find(p => p.name === 'Mohammed Shami');

  assert.equal(bumrah?.rating, 85, 'Jasprit Bumrah rating must be 85');
  assert.equal(dhoni?.rating, 82, 'MS Dhoni rating must be 82');
  assert.equal(siraj?.rating, 75, 'Mohammed Siraj rating must be 75');
  assert.equal(arshdeep?.rating, 70, 'Arshdeep Singh rating must be 70');
  assert.equal(shami?.rating, 70, 'Mohammed Shami rating must be 70');
});

test('user requested player tier movements to Tier 2 match exactly', () => {
  const movedNames = ['Mitchell Marsh', 'Prabhsimran Singh', 'Noor Ahmad', 'Rinku Singh', 'Marco Jansen'];
  movedNames.forEach(name => {
    const player = IPL_PLAYERS.find(p => p.name === name || (name === 'Mitchell Marsh' && p.name.includes('Marsh')));
    assert.ok(player, `${name} must exist`);
    assert.equal(player.tier, 'Tier 2', `${name} must be in Tier 2`);
    assert.equal(player.set, 'Tier 2', `${name} set must be Tier 2`);
  });
});

test('tier pool sizes match exact expected modern counts', () => {
  const tier1 = IPL_PLAYERS.filter(p => p.set === 'Tier 1' || p.tier === 'Tier 1');
  const tier2 = IPL_PLAYERS.filter(p => p.set === 'Tier 2' || p.tier === 'Tier 2');
  const tier3 = IPL_PLAYERS.filter(p => p.set === 'Tier 3' || p.tier === 'Tier 3');

  assert.equal(tier1.length, 42, 'Tier 1 should have exactly 42 players');
  assert.equal(tier2.length, 90, 'Tier 2 should have exactly 90 players');
  assert.equal(tier3.length, 125, 'Tier 3 should have exactly 125 players');
  assert.equal(tier1.length + tier2.length + tier3.length, 257, 'Total modern pool is 257 players');
});

test('all lots selection with Tier 1 and Tier 2 auctions all 42 Tier 1 and all 90 Tier 2 players sequentially', () => {
  const order = generatePlayerOrder('mega', ['Tier 1', 'Tier 2'], 'all');
  assert.equal(order.length, 42 + 90, 'Order length must equal all 132 players');

  // First 42 must all be Tier 1
  for (let i = 0; i < 42; i++) {
    const p = IPL_PLAYERS[order[i]];
    assert.equal(p.tier, 'Tier 1', `Player at index ${i} (${p.name}) must be Tier 1`);
  }

  // Next 90 must all be Tier 2
  for (let i = 42; i < 132; i++) {
    const p = IPL_PLAYERS[order[i]];
    assert.equal(p.tier, 'Tier 2', `Player at index ${i} (${p.name}) must be Tier 2`);
  }
});

test('dynamic room rating deltas are bounded in [-3, +3] and consistent within room', () => {
  const deltas = generateRoomRatingDeltas(IPL_PLAYERS);
  Object.entries(deltas).forEach(([pid, delta]) => {
    assert.ok(delta >= -3 && delta <= 3, `Delta for player ${pid} must be in range [-3, +3], got ${delta}`);
    assert.equal(Math.round(delta), delta, 'Delta must be an integer');
  });

  const bumrah = IPL_PLAYERS.find(p => p.name === 'Jasprit Bumrah');
  const r1 = getPlayerDynamicRating(bumrah, 'ROOM-1', deltas);
  const r2 = getPlayerDynamicRating(bumrah, 'ROOM-1', deltas);
  assert.equal(r1, r2, 'Dynamic rating must be consistent within same room');
  assert.ok(r1 >= bumrah.rating - 3 && r1 <= bumrah.rating + 3, 'Dynamic rating must be within ±3 of base rating');
});

test('RTM rules validation and execution in local auction engine', () => {
  const bumrah = IPL_PLAYERS.find(p => p.name === 'Jasprit Bumrah');
  const origTeam = getPlayerOriginalTeam(bumrah);
  assert.equal(origTeam, 'MI', 'Jasprit Bumrah original franchise must be MI');

  const roomTeams = [
    { teamId: 'MI', budgetRemaining: 100, squad: [], rtmRemaining: 2 },
    { teamId: 'CSK', budgetRemaining: 100, squad: [], rtmRemaining: 2 }
  ];

  // Eligible RTM
  assert.equal(canTeamUseRTM(bumrah, 'MI', roomTeams, 15, { enableRTM: true }), true);
  // Disabled RTM setting
  assert.equal(canTeamUseRTM(bumrah, 'MI', roomTeams, 15, { enableRTM: false }), false);
  // Wrong team
  assert.equal(canTeamUseRTM(bumrah, 'CSK', roomTeams, 15, { enableRTM: true }), false);
  // Insufficient budget
  const brokeMI = [{ teamId: 'MI', budgetRemaining: 10, squad: [], rtmRemaining: 2 }];
  assert.equal(canTeamUseRTM(bumrah, 'MI', brokeMI, 15, { enableRTM: true }), false);

  // Local auction engine RTM state test
  const initialLocalState = {
    id: 'SOLO-TEST',
    status: 'active',
    hostId: 'human_user',
    settings: { enableRTM: true, budget: 120 },
    roomTeams: [
      { userId: 'human_user', teamId: 'MI', isBot: false, budgetRemaining: 100, squad: [], rtmRemaining: 2 },
      { userId: 'bot_CSK', teamId: 'CSK', isBot: true, budgetRemaining: 100, squad: [] }
    ],
    players: [{ id: 'human_user', spent: 0, squadCount: 0 }, { id: 'bot_CSK', spent: 0, squadCount: 0 }],
    currentPlayerIndex: 0,
    playerOrder: [IPL_PLAYERS.indexOf(bumrah)],
    messages: [],
    currentAuction: {
      playerId: bumrah.id,
      currentBid: 14,
      highBidderId: 'bot_CSK',
      highBidderName: 'Chennai Super Kings',
      highBidderTeamId: 'CSK',
      status: 'bidding'
    }
  };

  // Resolve lot triggers RTM prompt for human user
  const rtmPromptState = localAuctionReducer(initialLocalState, { type: 'RESOLVE_LOT', now: 1000 });
  assert.equal(rtmPromptState.currentAuction.status, 'rtm');
  assert.equal(rtmPromptState.currentAuction.rtmTeamId, 'MI');

  // Exercise RTM by human user
  const exercisedState = localAuctionReducer(rtmPromptState, { type: 'EXERCISE_RTM', teamId: 'MI', now: 2000 });
  assert.equal(exercisedState.currentAuction.status, 'sold');
  assert.equal(exercisedState.currentAuction.highBidderTeamId, 'MI');
  const miTeam = exercisedState.roomTeams.find(t => t.teamId === 'MI');
  assert.equal(miTeam.rtmRemaining, 1);
  assert.equal(miTeam.squad.length, 1);
  assert.equal(miTeam.squad[0].id, bumrah.id);
  assert.equal(miTeam.budgetRemaining, 86);
});

