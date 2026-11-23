import { IPL_PLAYERS } from '../data/players.js';
import { countOverseas, isOverseasPlayer, r2, toFiniteNumber } from './auctionDisplay.js';

/**
 * Pure auction rules used by the cloud (RTDB) engine. Keeping these in one
 * place lets the regression tests exercise the real logic.
 */

export const AVAILABLE_TIERS = ['Tier 1', 'Tier 2', 'Tier 3'];

export const shuffleArray = (array) => {
  const a = [...array];
  // Multi-pass modern Fisher-Yates with strong randomness
  for (let pass = 0; pass < 2; pass++) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return a;
};

/** Normalize playerOrder from RTDB (array or object) into a clean number array */
export function normalizePlayerOrder(order) {
  if (!order) return [];
  if (Array.isArray(order)) return order.map(Number);
  if (typeof order === 'object') {
    return Object.keys(order)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => Number(order[k]))
      .filter((n) => !isNaN(n));
  }
  return [];
}

/**
 * Intelligently samples a balanced cricket roster across roles (WK, Batsmen, All-Rounders, Bowlers)
 * from the available player pool so capped auctions (20, 35, 50, 90, or custom) are playable and fun.
 */
function sampleBalancedRoles(pool, targetCount) {
  if (!targetCount || targetCount >= pool.length) return shuffleArray(pool);

  const byRole = {
    'Wicket-Keeper': [],
    'Batsman': [],
    'All-Rounder': [],
    'Bowler': [],
  };

  pool.forEach((idx) => {
    const role = IPL_PLAYERS[idx]?.role || 'All-Rounder';
    if (byRole[role]) byRole[role].push(idx);
    else byRole['All-Rounder'].push(idx);
  });

  Object.keys(byRole).forEach((r) => {
    byRole[r] = shuffleArray(byRole[r]);
  });

  const wkTarget = Math.max(1, Math.min(byRole['Wicket-Keeper'].length, Math.round(targetCount * 0.12)));
  const batTarget = Math.max(2, Math.min(byRole['Batsman'].length, Math.round(targetCount * 0.28)));
  const arTarget = Math.max(2, Math.min(byRole['All-Rounder'].length, Math.round(targetCount * 0.24)));
  const bowlTarget = Math.max(2, Math.min(byRole['Bowler'].length, Math.round(targetCount * 0.36)));

  const selected = [
    ...byRole['Wicket-Keeper'].slice(0, wkTarget),
    ...byRole['Batsman'].slice(0, batTarget),
    ...byRole['All-Rounder'].slice(0, arTarget),
    ...byRole['Bowler'].slice(0, bowlTarget),
  ];

  const selectedSet = new Set(selected);
  const remainingPool = shuffleArray(pool.filter((idx) => !selectedSet.has(idx)));

  while (selected.length < targetCount && remainingPool.length > 0) {
    selected.push(remainingPool.pop());
  }

  return shuffleArray(selected.slice(0, targetCount));
}

/**
 * Arranges auction lots within a single tier into an exciting, thrilling sequence:
 * 1. Blockbuster Opener (Lot 1 of tier): A top superstar kicks off the bidding.
 * 2. Role Interleaving: Alternates between roles so players don't face repetitive runs.
 * 3. Late Climax Stars: Injects high-stakes superstar anchors near the final 15% mark
 *    of the tier to preserve drama and strategic budget decisions.
 */
function arrangeExcitingAuction(selectedIndices) {
  if (selectedIndices.length <= 3) return shuffleArray(selectedIndices);

  const players = selectedIndices.map((i) => ({ index: i, player: IPL_PLAYERS[i] }));
  const maxRating = Math.max(...players.map((p) => p.player?.rating || 70));
  const marqueeThreshold = Math.max(75, maxRating - 3);

  const marquees = [];
  const regulars = [];

  players.forEach((p) => {
    if ((p.player?.rating || 0) >= marqueeThreshold) {
      marquees.push(p);
    } else {
      regulars.push(p);
    }
  });

  const shuffledMarquees = shuffleArray(marquees);
  const shuffledRegulars = shuffleArray(regulars);

  if (shuffledMarquees.length === 0) return shuffleArray(selectedIndices);

  // Pick 1 blockbuster opener for Lot 1 of this tier
  const opener = shuffledMarquees.pop();

  // Pick 1 or 2 late climax superstars (for the final ~15% of the tier)
  const lateSuperstars = [];
  if (shuffledMarquees.length > 2 && selectedIndices.length >= 15) {
    lateSuperstars.push(shuffledMarquees.pop());
    if (shuffledMarquees.length > 5 && selectedIndices.length >= 35) {
      lateSuperstars.push(shuffledMarquees.pop());
    }
  }

  const roleQueues = {
    'Batsman': [],
    'Bowler': [],
    'All-Rounder': [],
    'Wicket-Keeper': [],
  };

  const remaining = shuffleArray([...shuffledMarquees, ...shuffledRegulars]);
  remaining.forEach((p) => {
    const r = p.player?.role || 'All-Rounder';
    if (roleQueues[r]) roleQueues[r].push(p);
    else roleQueues['All-Rounder'].push(p);
  });

  const interleaved = [];
  const roleKeys = shuffleArray(['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper']);
  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    for (const r of roleKeys) {
      if (roleQueues[r].length > 0) {
        interleaved.push(roleQueues[r].pop());
        hasMore = true;
      }
    }
  }

  const finalOrder = [opener];
  const climaxInsertIndex = Math.max(1, Math.floor(selectedIndices.length * 0.82));

  interleaved.forEach((p) => {
    if (finalOrder.length === climaxInsertIndex && lateSuperstars.length > 0) {
      finalOrder.push(lateSuperstars.pop());
    }
    finalOrder.push(p);
  });

  while (lateSuperstars.length > 0) {
    finalOrder.splice(Math.max(1, finalOrder.length - 2), 0, lateSuperstars.pop());
  }

  return finalOrder.map((p) => p.index);
}

/** Build the sequential lot order for an auction: selected tiers auction sequentially (Tier 1 ➔ Tier 2 ➔ Tier 3), with complete internal shuffling and role variety per tier, zero mixing across tiers. */
export function generatePlayerOrder(auctionType = 'mega', selectedSets = null, maxLots = null) {
  if (auctionType === 'legends') {
    const byRole = {};
    IPL_PLAYERS.forEach((p, i) => {
      if (p.set === 'Legends' || p.tier === 'Legends') {
        (byRole[p.role] ||= []).push(i);
      }
    });
    const order = [];
    ['Batsman', 'All-Rounder', 'Wicket-Keeper', 'Bowler'].forEach((role) => {
      if (byRole[role]) order.push(...shuffleArray(byRole[role]));
    });
    if (typeof maxLots === 'number' && maxLots > 0) {
      return order.slice(0, Math.min(maxLots, order.length));
    }
    return order;
  }

  // Modern pool strictly filtered by selectedSets / selectedTiers
  const userSelected =
    Array.isArray(selectedSets) && selectedSets.length > 0
      ? selectedSets
      : AVAILABLE_TIERS;

  // Canonical sequential tier flow: Tier 1 -> Tier 2 -> Tier 3
  const activeTiers = [
    ...AVAILABLE_TIERS.filter((t) => userSelected.includes(t)),
    ...userSelected.filter((t) => !AVAILABLE_TIERS.includes(t)),
  ];

  // Bucket players strictly by tier
  const tierBuckets = {};
  activeTiers.forEach((t) => {
    tierBuckets[t] = [];
  });

  IPL_PLAYERS.forEach((p, i) => {
    if (p.set === 'Legends' || p.tier === 'Legends') return;
    const pTier = p.tier || p.set;
    if (tierBuckets[pTier]) {
      tierBuckets[pTier].push(i);
    }
  });

  const totalAvailable = activeTiers.reduce((acc, t) => acc + (tierBuckets[t]?.length || 0), 0);
  if (totalAvailable === 0) return [];

  // Parse and validate maxLots (supports 20, 35, 50, 90, or custom count)
  const parsedMax =
    typeof maxLots === 'number' && maxLots > 0
      ? Math.min(Math.max(5, maxLots), totalAvailable)
      : null;

  let tierAllocations = {};
  if (parsedMax && parsedMax < totalAvailable) {
    let allocatedSoFar = 0;
    activeTiers.forEach((tierName, idx) => {
      const tierCount = tierBuckets[tierName]?.length || 0;
      if (idx === activeTiers.length - 1) {
        tierAllocations[tierName] = parsedMax - allocatedSoFar;
      } else {
        const share = Math.round((tierCount / totalAvailable) * parsedMax);
        const alloc = Math.min(tierCount, Math.max(1, share));
        tierAllocations[tierName] = alloc;
        allocatedSoFar += alloc;
      }
    });
    let currentTotal = Object.values(tierAllocations).reduce((a, b) => a + b, 0);
    while (currentTotal > parsedMax) {
      const maxTier = activeTiers.reduce((best, t) => (tierAllocations[t] > tierAllocations[best] ? t : best), activeTiers[0]);
      tierAllocations[maxTier]--;
      currentTotal--;
    }
    while (currentTotal < parsedMax) {
      const availTier = activeTiers.find((t) => tierAllocations[t] < tierBuckets[t].length);
      if (availTier) {
        tierAllocations[availTier]++;
        currentTotal++;
      } else {
        break;
      }
    }
  } else {
    activeTiers.forEach((t) => {
      tierAllocations[t] = tierBuckets[t]?.length || 0;
    });
  }

  // Sequentially assemble each tier in strict order (Tier 1 -> Tier 2 -> Tier 3)
  // Each tier is internally balanced and shuffled so no two auctions are identical, with zero mixing across tiers
  const order = [];
  activeTiers.forEach((tierName) => {
    const playersInTier = tierBuckets[tierName] || [];
    const alloc = tierAllocations[tierName] || 0;
    if (alloc > 0 && playersInTier.length > 0) {
      const sampled = sampleBalancedRoles(playersInTier, alloc);
      order.push(...arrangeExcitingAuction(sampled));
    }
  });

  return order;
}

export const normalizeSquad = (squad) => mapRoomPlayers(squad, (entry) => entry);

export const getSquadEntryId = (entry) =>
  typeof entry === 'string' ? entry : entry?.id;

/** RTDB may return a dense JSON array or an object keyed by index. */
export function mapRoomPlayers(players, mapper) {
  const list = Array.isArray(players)
    ? players
    : players && typeof players === 'object'
      ? Object.values(players)
      : [];
  return list.filter(Boolean).map(mapper);
}

export const MIN_TEAMS_TO_START = 2;

/** Distinct franchises in the room. Human and bot managers both carry `team`. */
export function countAuctionTeams(players) {
  return new Set(mapRoomPlayers(players, (player) => player.team).filter(Boolean)).size;
}

/** Base price for the opening bid, otherwise the next increment (rounded). */
export function getNextBidAmount(player, currentBid) {
  const current = toFiniteNumber(currentBid, 0);
  if (current === 0) return toFiniteNumber(player?.basePrice, 0);
  return r2(current + (current < 5 ? 0.2 : 0.25));
}

/**
 * Squad/overseas rules that every winning bid must satisfy. Returns a reason
 * string, or null when the team may bid.
 */
export function getSquadConstraintError({
  team,
  player,
  squadLimit = 25,
  overseasLimit = 8,
  playerIndex,
}) {
  if (!team) return 'Pick a team before bidding';

  const squad = normalizeSquad(team.squad);
  const playerId = player?.id;

  if (squad.some((entry) => getSquadEntryId(entry) === playerId)) {
    return 'This player is already in your squad';
  }

  if (squad.length >= toFiniteNumber(squadLimit, 25)) {
    return 'Squad is full';
  }

  if (isOverseasPlayer(player)) {
    const overseas = countOverseas(squad, playerIndex);
    if (overseas >= toFiniteNumber(overseasLimit, 8)) {
      return 'Overseas player limit reached';
    }
  }

  return null;
}

/**
 * Merge a manager into a room roster without dropping stats that were already
 * recorded (spent / squadCount / bot flags). Used inside RTDB transactions so
 * two managers joining at the same moment cannot overwrite each other.
 */
export function mergeRoomPlayer(players, player) {
  const list = mapRoomPlayers(players, (entry) => entry);

  const existing = list.find(
    (entry) => entry.id === player.id || entry.userId === player.id,
  );

  return [
    ...list.filter(
      (entry) => entry.id !== player.id && entry.userId !== player.id,
    ),
    { ...(existing || {}), ...player },
  ];
}

/**
 * Decide what `startAuction` should do from the current room/live snapshot.
 * - completed: auction finished, do nothing
 * - running: a lot is already live, never restart it
 * - resume: room is active but the live lot is missing (a start was interrupted)
 * - start: waiting room, create the order and first lot
 */
export function getStartDisposition(room, live) {
  if (!room) return 'missing';
  if (room.status === 'completed') return 'completed';
  // The last lot was finalized; only the room-status write may be missing.
  if (live?.status === 'completed') return 'completed';
  if (live?.status && live.status !== 'waiting') return 'running';
  if (room.status === 'active') return 'resume';
  return 'start';
}

/** Recovery delay before a finalized lot is advanced again by any client. */
export function finalizedLotRecoveryDelay(status) {
  if (status === 'sold') return 6000;
  if (status === 'unsold') return 3000;
  return null;
}

/**
 * Decision predicate for server-side host-disconnect auto-pause.
 * The server-side onDisconnect fallback must only be armed when:
 * 1. The client socket is actively connected.
 * 2. The client is the host.
 * 3. This tab is the designated primary tab for this host session.
 * 4. The room is actively running (not waiting/completed).
 * 5. The live lot is actively bidding (not paused/sold/unsold/completed).
 * 6. A valid lot/player is active.
 */
export function shouldArmDisconnectPause({
  socketConnected,
  isHost,
  isPrimaryTab = true,
  roomStatus,
  liveStatus,
  playerId,
}) {
  return Boolean(
    socketConnected &&
    isHost &&
    isPrimaryTab &&
    roomStatus === 'active' &&
    liveStatus === 'bidding' &&
    playerId,
  );
}

/**
 * Action resolver for the onDisconnect lifecycle.
 * Prevents stale operations from lingering or overwriting newer lots/completed rooms.
 */
export function resolveDisconnectAction({
  shouldArm,
  currentlyArmed,
  armedLotId,
  currentLotId,
}) {
  if (shouldArm) {
    if (currentlyArmed && armedLotId !== currentLotId) {
      return 'rearm';
    }
    if (!currentlyArmed) {
      return 'arm';
    }
    return 'none';
  }
  if (currentlyArmed) {
    return 'cancel';
  }
  return 'none';
}

/**
 * IPL Franchise association for top players, enabling the optional Right to Match (RTM) card rule.
 */
export const PLAYER_ORIGINAL_TEAMS = {
  'Jasprit Bumrah': 'MI',
  'Rohit Sharma': 'MI',
  'Suryakumar Yadav': 'MI',
  'Hardik Pandya': 'MI',
  'Tilak Varma': 'MI',
  'Ishan Kishan': 'MI',
  'Virat Kohli': 'RCB',
  'Rajat Patidar': 'RCB',
  'Mohammed Siraj': 'RCB',
  'Glenn Maxwell': 'RCB',
  'Will Jacks': 'RCB',
  'Mahendra Singh Dhoni': 'CSK',
  'Ravindra Jadeja': 'CSK',
  'Ruturaj Gaikwad': 'CSK',
  'Shivam Dube': 'CSK',
  'Matheesha Pathirana': 'CSK',
  'Rishabh Pant': 'DC',
  'Axar Patel': 'DC',
  'Kuldeep Yadav': 'DC',
  'Jake Fraser-McGurk': 'DC',
  'Shubman Gill': 'GT',
  'Rashid Khan': 'GT',
  'Mohammed Shami': 'GT',
  'Sai Sudharsan': 'GT',
  'Rahul Tewatia': 'GT',
  'Sanju Samson': 'RR',
  'Yashasvi Jaiswal': 'RR',
  'Jos Buttler': 'RR',
  'Yuzvendra Chahal': 'RR',
  'Trent Boult': 'RR',
  'Riyan Parag': 'RR',
  'Shimron Hetmyer': 'RR',
  'Sunil Narine': 'KKR',
  'Andre Russell': 'KKR',
  'Rinku Singh': 'KKR',
  'Shreyas Iyer': 'KKR',
  'Varun Chakaravarthy': 'KKR',
  'Harshit Rana': 'KKR',
  'KL Rahul': 'LSG',
  'Nicholas Pooran': 'LSG',
  'Ravi Bishnoi': 'LSG',
  'Mayank Yadav': 'LSG',
  'Marcus Stoinis': 'LSG',
  'Quinton De Kock': 'LSG',
  'Arshdeep Singh': 'PBKS',
  'Sam Curran': 'PBKS',
  'Prabhsimran Singh': 'PBKS',
  'Jitesh Sharma': 'PBKS',
  'Shashank Singh': 'PBKS',
  'Ashutosh Sharma': 'PBKS',
  'Heinrich Klaasen': 'SRH',
  'Pat Cummins': 'SRH',
  'Travis Head': 'SRH',
  'Abhishek Sharma': 'SRH',
  'Bhuvneshwar Kumar': 'SRH',
  'Nitish Kumar Reddy': 'SRH',
  'T. Natarajan': 'SRH',
};

/**
 * Checks whether a team can exercise Right to Match (RTM) on the current player lot.
 */
export function getPlayerOriginalTeam(player) {
  if (!player) return null;
  return player.originalTeam || player.team || PLAYER_ORIGINAL_TEAMS[player.name] || null;
}

export function canTeamUseRTM(player, teamId, roomTeams, currentBid, settings) {
  if (!settings?.enableRTM) return false;
  if (!player || !teamId || currentBid <= 0) return false;
  const originalTeam = getPlayerOriginalTeam(player);
  if (!originalTeam || originalTeam !== teamId) return false;

  const team = (roomTeams || []).find((t) => (t.teamId || t.id) === teamId);
  if (!team) return false;

  // Each team gets 2 RTM cards by default
  const rtmRemaining = team.rtmRemaining !== undefined ? team.rtmRemaining : 2;
  if (rtmRemaining <= 0) return false;

  // Check budget constraint: team must have enough purse left to match the bid
  const budgetRemaining = team.budgetRemaining !== undefined ? team.budgetRemaining : 120;
  if (budgetRemaining < currentBid) return false;

  // Check squad limit
  const squad = team.squad || [];
  const squadArr = Array.isArray(squad) ? squad : Object.values(squad);
  const maxSquad = settings?.squadLimit || 25;
  if (squadArr.length >= maxSquad) return false;

  return true;
}

/**
 * Generates room rating deltas: an integer between -3 and +3 for each player.
 * Applied dynamically per auction room without mentioning any words like "hot" or "cold".
 */
export function generateRoomRatingDeltas(players = IPL_PLAYERS) {
  const deltas = {};
  players.forEach((p) => {
    // Discrete random integer: -3, -2, -1, 0, 1, 2, or 3
    deltas[p.id] = Math.floor(Math.random() * 7) - 3;
  });
  return deltas;
}

/**
 * Computes a player's dynamic rating for a specific auction room (max +3 or -3).
 * Fully deterministic per room so all human and bot managers in the same room see identical values.
 */
export function getPlayerDynamicRating(player, roomId = null, ratingDeltas = null) {
  if (!player || typeof player.rating !== 'number') return player?.rating || 0;
  let delta = 0;
  if (ratingDeltas && typeof ratingDeltas[player.id] === 'number') {
    delta = ratingDeltas[player.id];
  } else if (roomId) {
    let hash = 0;
    const str = `${roomId}_${player.id}`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    delta = (Math.abs(hash) % 7) - 3;
  }
  return Math.min(99, Math.max(25, player.rating + delta));
}

