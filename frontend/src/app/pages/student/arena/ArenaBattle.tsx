import { useState, useEffect, useRef } from "react";
import { AuroraText } from "@/components/magicui/aurora-text";
import { Swords, Shield, Zap, RefreshCw, Crosshair, Play, Pause, X, Info } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import "./arena.css";

interface ArenaBattleProps {
  courseId: string;
  baitedHp: number;
  onExit: () => void;
}

// --- Types ---
type CardType = 'CONCEPT_ANSWER' | 'POWER_UP';
type PowerUpType = 'MULTIPLIER_2X' | 'SHIELD' | 'CARD_REDRAW' | 'STEAL_SNIPER';

interface Card {
  id: string;
  name: string;
  type: CardType;
  description: string;
  powerUpType?: PowerUpType;
  isCorrect?: boolean;
}

interface QuestionCard {
  promptText: string;
}

type RoundState = 'intro' | 'loading' | 'playing' | 'resolving' | 'extend_prompt' | 'game_over';

const POWERUP_DICTIONARY = ['Shield', 'Wildcard', 'Quick Counter', 'The Joker', 'Reversal', 'Blocker'];

const POWERUP_DESCRIPTIONS: Record<string, string> = {
  'Shield': 'Blocks all point deductions on a wrong answer.',
  'Wildcard': 'Acts as any correct concept card.',
  'Quick Counter': 'Doubles your multiplier permanently after 2 consecutive wins.',
  'The Joker': 'Automatically plays the correct answer cards for max points.',
  'Reversal': 'Reflects negative points to the opponent.',
  'Blocker': 'Prevents the AI from scoring this round.'
};

export default function ArenaBattle({ courseId, baitedHp, milestoneThreshold, onExit }: ArenaBattleProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [battleId, setBattleId] = useState<string | null>(null);
  
  // Game State
  const [currentRound, setCurrentRound] = useState(1);
  const [roundState, setRoundState] = useState<RoundState>('intro');
  const [timer, setTimer] = useState(30);
  
  const [isExtended, setIsExtended] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [highestComboMultiplier, setHighestComboMultiplier] = useState(1);
  
  const [activePowerupAnim, setActivePowerupAnim] = useState<{name: string, type: string} | null>(null);
  const [isCounterActive, setIsCounterActive] = useState(false);
  
  const [playerScore, setPlayerScore] = useState(0);
  const [computerScore, setComputerScore] = useState(0);

  // Summary Tracking
  const [totalPointsEarned, setTotalPointsEarned] = useState(0);
  const [totalPointsLost, setTotalPointsLost] = useState(0);
  const [powerUpsUsedCount, setPowerUpsUsedCount] = useState(0);
  const [milestoneHpEarned, setMilestoneHpEarned] = useState(0);
  const [hpFadingText, setHpFadingText] = useState("");
  
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [question, setQuestion] = useState<QuestionCard | null>(null);
  
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [playedCards, setPlayedCards] = useState<Card[]>([]);
  const [computerPlayedCards, setComputerPlayedCards] = useState<Card[]>([]);
  const [computerComboName, setComputerComboName] = useState<string>("");
  const [computerComboMultiplier, setComputerComboMultiplier] = useState<number>(1);
  const [comboName, setComboName] = useState<string>("");
  const [comboMultiplier, setComboMultiplier] = useState<number>(1);
  
  const [inventory, setInventory] = useState<string[]>([]);
  const [selectedPowerUpSlot, setSelectedPowerUpSlot] = useState<number | null>(null);
  
  const [highestHpMilestone, setHighestHpMilestone] = useState(0);
  
  const [roundResultText, setRoundResultText] = useState("");
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const battleContainerRef = useRef<HTMLDivElement>(null);

  // Sync HP helper
  const syncGlobalHp = (delta: number) => {
    const current = Number(localStorage.getItem('arena_hp_delta') || 0);
    localStorage.setItem('arena_hp_delta', (current + delta).toString());
    window.dispatchEvent(new Event('storage')); // trigger update across app
  };

  // --- Handlers ---
  const startMatch = async () => {
    try {
      if (battleContainerRef.current && !document.fullscreenElement) {
        await battleContainerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
      
      // Deduct bet from global HP at start
      syncGlobalHp(-baitedHp);
      
      setRoundState('loading');
      
      const response = await apiClient.post(`/arena/${courseId}/battle/start`);
      const newBattleId = response.data._id;
      setBattleId(newBattleId);
      
      startNewRound(1, newBattleId);
    } catch (err) {
      console.warn("API failed or blocked", err);
      alert("Failed to start match from server.");
      setIsFullscreen(false);
      if (document.fullscreenElement) {
         document.exitFullscreen();
      }
      if (onExit) onExit();
      return;
    }
  };

  const handleExtendBattle = async () => {
    if (!battleId || isActionSubmitting) return;
    setIsActionSubmitting(true);
    try {
      const res = await apiClient.post(`/arena/battle/${battleId}/extend`);
      if (res.data && res.data.success) {
        setIsExtended(true);
        startNewRound(6);
      } else {
        alert("Failed to extend battle.");
      }
    } catch (err: any) {
      console.error("Failed extending battle:", err);
      alert(err?.response?.data?.message || "Failed to extend battle.");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleConcludeBattle = async () => {
    if (!battleId || isActionSubmitting) return;
    setIsActionSubmitting(true);
    try {
      await apiClient.post(`/arena/battle/${battleId}/conclude`);
    } catch (err) {
      console.error("Failed concluding battle:", err);
    } finally {
      setIsActionSubmitting(false);
    }
    setRoundState('game_over');
  };

  const startNewRound = async (roundNum: number, bId?: string) => {
    if (!isExtended && roundNum > 5) {
      setRoundState('extend_prompt');
      return;
    }
    if (roundNum > 10) {
      const activeBattleId = bId || battleId;
      if (activeBattleId) {
        try {
          await apiClient.post(`/arena/battle/${activeBattleId}/conclude`);
        } catch (err) {
          console.error("Failed concluding battle on cap:", err);
        }
      }
      setRoundState('game_over');
      return;
    }
    
    setCurrentRound(roundNum);
    setSelectedCards([]);
    setPlayedCards([]);
    setComboName("");
    setComboMultiplier(1);
    setComputerPlayedCards([]);
    setComputerComboName("");
    setComputerComboMultiplier(1);
    setTimer(30);
    setRoundState('loading');
    
    const activeBattleId = bId || battleId;
    if (activeBattleId) {
      try {
         const qRes = await apiClient.post(`/arena/battle/${activeBattleId}/question`);
         const { text, deck } = qRes.data;
         setQuestion({ promptText: text });
         setPlayerHand(deck);
      } catch (err) {
         console.error("Failed fetching question", err);
         alert("Failed to fetch round from API. Match aborted.");
         setRoundState('game_over');
         return;
      }
    } else {
       alert("No active battle found. Match aborted.");
       setRoundState('game_over');
       return;
    }

    setRoundState('playing');
  };

  // Timer Effect & Keyboard Listeners
  useEffect(() => {
    if (roundState === 'playing' && timer > 0 && !isPaused) {
      timerRef.current = setTimeout(() => setTimer(timer - 1), 1000);
    } else if (roundState === 'playing' && timer === 0 && !isPaused) {
      // Auto-play selected or a random card if timer runs out
      if (selectedCards.length > 0) {
        handlePlayCards(selectedCards);
      } else {
        const randomCard = playerHand.find(c => c.type === 'CONCEPT_ANSWER') || playerHand[0];
        handlePlayCards(randomCard ? [randomCard] : []);
      }
    }
    
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timer, roundState, isPaused, playerHand, selectedCards]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        if (roundState !== 'intro' && roundState !== 'game_over') {
          setIsPaused(true);
        }
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [roundState]);

  const triggerHpFadingText = () => {
    setHpFadingText("+20 HP");
    setTimeout(() => {
      setHpFadingText("");
    }, 2500);
  };

  const handlePlayCards = async (cards: Card[]) => {
    if (roundState !== 'playing') return;
    
    const currentPowerUp = selectedPowerUpSlot !== null ? inventory[selectedPowerUpSlot] : null;
    const usedPowerUpSlot = selectedPowerUpSlot;
    setSelectedPowerUpSlot(null);
    
    let finalCards = cards;
    
    setRoundState('resolving');
    setPlayedCards(finalCards);
    
    if (currentPowerUp) {
      setPowerUpsUsedCount(prev => prev + 1);
    }
    
    let submitRes: any = null;
    let oldScore = playerScore;
    
    if (battleId && finalCards.length > 0) {
      try {
         const response = await apiClient.post(`/arena/battle/${battleId}/submit`, { 
             cards: finalCards.map(c => c.name || 'Timeout'),
             powerUp: currentPowerUp,
             powerUpSlotIndex: usedPowerUpSlot
         });
         submitRes = response.data;
         setComboName(submitRes.comboName || "Combo Broken!");
      } catch (error) {
         console.error("API error", error);
      }
    }

    if (currentPowerUp) {
      setActivePowerupAnim({ name: currentPowerUp, type: currentPowerUp });
      setInventory(prev => prev.filter((_, idx) => idx !== usedPowerUpSlot));
      if (currentPowerUp === 'Quick Counter') {
        setIsCounterActive(true);
      }
      setTimeout(() => {
        setActivePowerupAnim(null);
      }, 2000);
    }
    
    if (submitRes && submitRes.battle && submitRes.battle.inventory) {
      setInventory(submitRes.battle.inventory);
    }
    
    setTimeout(() => {
      let compCards: Card[] = [];
      if (submitRes && submitRes.computerResult && submitRes.computerResult.cards) {
          compCards = submitRes.computerResult.cards.map((c: any, i: number) => ({
              id: `comp_${i}`,
              name: c.name,
              type: 'CONCEPT_ANSWER',
              description: c.explanation || '',
              isCorrect: c.isCorrect
          }));
      }
      setComputerPlayedCards(compCards);
      resolveRound(finalCards, compCards, submitRes, playerScore, currentPowerUp);
    }, 1000); 
  };

  const resolveRound = (pCards: Card[], cCards: Card[], submitRes: any, oldScore: number, currentPowerUp: string | null) => {
    let pScoreDelta = 0;
    let cScoreDelta = 0;
    
    let resultMsg = "";

    // Base scoring logic locally if API didn't return it
    if (submitRes) {
      pScoreDelta = submitRes.pointsEarned;
      if (submitRes.actionSummary === 'Win') {
        resultMsg += `You struck with ${submitRes.comboName}! `;
      } else if (submitRes.actionSummary === 'Shield blocked loss') {
        resultMsg += "Shield activated! Points protected. ";
      } else {
        resultMsg += "Your combo failed! ";
      }
      
      setComboMultiplier(submitRes.multiplier);
      setHighestComboMultiplier(prev => Math.max(prev, submitRes.multiplier));

      if (submitRes.computerResult) {
          cScoreDelta = submitRes.computerResult.scoreDelta;
          setComputerComboName(submitRes.computerResult.comboName);
          setComputerComboMultiplier(submitRes.computerResult.multiplier);
      }
      
      if (submitRes.milestoneChecks?.powerUpGranted) {
        resultMsg += " | Power-Up Acquired!";
      }
      if (submitRes.milestoneChecks?.hpTriggered) {
        syncGlobalHp(20);
        setMilestoneHpEarned(prev => prev + 20);
        triggerHpFadingText();
        resultMsg += " | +20 HP Regenerated!";
      }
    } else {
      // Basic fallback if API fails
      pScoreDelta = -30;
      setComboMultiplier(0);
      resultMsg += "Miss! ";
      cScoreDelta = 0;
      setComputerComboName("Error");
      setComputerComboMultiplier(0);
    }

    if (pScoreDelta > 0) setTotalPointsEarned(prev => prev + pScoreDelta);
    if (pScoreDelta < 0) setTotalPointsLost(prev => prev + Math.abs(pScoreDelta));

    const newPlayerScore = submitRes ? submitRes.battle.totalPoints : oldScore + pScoreDelta;
    const newComputerScore = submitRes ? submitRes.battle.computerScore : (oldScore + cScoreDelta); // fallback doesn't track comp well

    setPlayerScore(Math.max(0, newPlayerScore));
    setComputerScore(Math.max(0, newComputerScore));
    setRoundResultText(resultMsg);

    setTimeout(() => {
      startNewRound(currentRound + 1);
    }, 3500);
  };

  const exitMatch = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    onExit();
  };

  // Check Game Over logic to award HP if player wins
  useEffect(() => {
    if (roundState === 'game_over') {
      const isWin = playerScore > computerScore;
      if (isWin) {
        syncGlobalHp(baitedHp * 2);
      }
      const currentHighestPoints = Number(localStorage.getItem('arena_pvc_highest') || 0);
      if (playerScore > currentHighestPoints) {
        localStorage.setItem('arena_pvc_highest', playerScore.toString());
      }
    }
  }, [roundState, playerScore, computerScore, baitedHp]);

  // --- Renders ---
  
  if (roundState === 'intro') {
    return (
      <div ref={battleContainerRef} className="arena-battle-container p-6 w-full max-w-6xl mx-auto min-h-[70vh] flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="bg-[#1a1a24] p-12 rounded-2xl border border-purple-500/30 shadow-[0_0_50px_rgba(160,124,254,0.15)] text-center max-w-2xl w-full">
            <Swords className="w-20 h-20 text-purple-400 mx-auto mb-6" />
            <h3 className="text-4xl font-bold text-white mb-4">Ready for Combat</h3>
            
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 mb-8">
              <p className="text-lg text-slate-300 mb-2">Total Bet Pool:</p>
              <div className="text-5xl font-black text-amber-400">{baitedHp * 2} HP</div>
              <p className="text-sm text-slate-500 mt-2">(You bet: {baitedHp} | AI bet: {baitedHp})</p>
            </div>
            
            <p className="text-slate-400 text-lg mb-8">
              Survive 5 rounds of strict knowledge evaluation to win the pool. Outscore your opponent to claim victory!
            </p>

            <div className="flex justify-center gap-4">
              <button onClick={startMatch} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-4 px-10 rounded-full text-xl shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                <Play className="fill-current" /> START MATCH
              </button>
              <button onClick={onExit} className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-4 px-8 rounded-full font-bold transition-colors">
                Retreat
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (roundState === 'game_over') {
    const isWin = playerScore > computerScore;
    const isTie = playerScore === computerScore;
    
    return (
      <div ref={battleContainerRef} className="game-fullscreen-container justify-center items-center p-8 bg-slate-950">
        <div className="bg-[#1a1a24] p-10 rounded-3xl border-2 shadow-2xl max-w-4xl w-full flex flex-col items-center" style={{ borderColor: isWin ? '#34d399' : (isTie ? '#fbbf24' : '#ef4444') }}>
          <h2 className="text-5xl font-black mb-2" style={{ color: isWin ? '#34d399' : (isTie ? '#fbbf24' : '#ef4444') }}>
            {isWin ? 'VICTORY ACHIEVED' : (isTie ? 'DRAW' : 'DEFEAT')}
          </h2>
          <p className="text-slate-400 mb-8">Match Summary</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-8">
            {/* Score Breakdown */}
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-4">
                <span className="text-slate-400 font-medium">Your Score</span>
                <span className="text-3xl font-bold text-white">{playerScore}</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-slate-400 font-medium">AI Score</span>
                <span className="text-3xl font-bold text-slate-300">{computerScore}</span>
              </div>
              <div className="h-px bg-slate-700/50 w-full my-2"></div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-green-400">Points Earned: +{totalPointsEarned}</span>
                <span className="text-red-400">Points Lost: -{totalPointsLost}</span>
              </div>
            </div>

            {/* Rewards Breakdown */}
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50 flex flex-col justify-center">
              <h4 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Match Rewards</h4>
              
              <div className="flex justify-between items-center mb-3">
                <span className="text-slate-300">Bet Pool Return</span>
                <span className={`font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                  {isWin ? `+${baitedHp * 2} HP` : `-${baitedHp} HP`}
                </span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-slate-300">Milestone Bonus</span>
                <span className="font-bold text-blue-400">+{milestoneHpEarned} HP</span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-slate-300">Total HP Earned</span>
                <span className="font-bold text-green-400">{isWin ? (baitedHp * 2) + milestoneHpEarned : milestoneHpEarned} HP</span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-slate-300">Power-Ups Used</span>
                <span className="font-bold text-amber-400">{powerUpsUsedCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Max Multiplier</span>
                <span className="font-bold text-purple-400">{highestComboMultiplier}x</span>
              </div>
            </div>
          </div>

          <button onClick={exitMatch} className="bg-purple-600 hover:bg-purple-500 text-white py-4 px-12 rounded-full font-bold text-xl shadow-[0_0_20px_rgba(147,51,234,0.3)] transition-transform hover:scale-105">
            Return to Arena Dashboard
          </button>
        </div>
      </div>
    );
  }

  const renderPowerupAnim = () => {
    if (!activePowerupAnim) return null;
    const { type } = activePowerupAnim;
    let icon = null;
    let text = "";
    if (type === 'Shield') { text = "SHIELDED"; icon = <Shield className="w-32 h-32 text-blue-400 mx-auto mb-4 drop-shadow-[0_0_20px_rgba(96,165,250,0.8)]" />; }
    else if (type === 'Blocker') { text = "BLOCKED"; icon = <X className="w-32 h-32 text-red-500 mx-auto mb-4 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]" />; }
    else if (type === 'The Joker') { text = "HAHAHA"; icon = <div className="text-[120px] mb-4 animate-bounce drop-shadow-2xl">🤡</div>; } 
    else if (type === 'Wildcard') { text = "WILDCARD"; icon = <Zap className="w-32 h-32 text-yellow-400 mx-auto mb-4 animate-pulse drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]" />; }
    else if (type === 'Quick Counter') { text = "COUNTERED"; icon = <Swords className="w-32 h-32 text-orange-500 mx-auto mb-4 drop-shadow-[0_0_20px_rgba(249,115,22,0.8)]" />; }
    else if (type === 'Reversal') { text = "REVERSED"; icon = <RefreshCw className="w-32 h-32 text-green-400 mx-auto mb-4 animate-spin drop-shadow-[0_0_20px_rgba(74,222,128,0.8)]" />; }

    return (
      <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="text-center animate-in zoom-in-50 duration-500">
          {icon}
          <h1 className="text-6xl md:text-8xl font-black text-white tracking-widest uppercase drop-shadow-[0_0_20px_rgba(255,255,255,0.6)]" style={{ WebkitTextStroke: '2px black' }}>
            {text}
          </h1>
        </div>
      </div>
    );
  };

  return (
    <div ref={battleContainerRef} className="game-fullscreen-container bg-[#0b0c10] overflow-hidden relative w-full h-screen">
      
      {renderPowerupAnim()}
      
      {/* Floating HP Fading Text */}
      {hpFadingText && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-green-400 text-6xl font-black z-50 animate-bounce fade-out-fast drop-shadow-[0_0_20px_rgba(74,222,128,0.8)] pointer-events-none">
          {hpFadingText}
        </div>
      )}

      {/* Pause Menu Overlay */}
      {isPaused && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in">
          <div className="bg-[#1a1a24] p-8 rounded-2xl border border-slate-700 w-full max-w-2xl flex gap-8 shadow-2xl">
            {/* Rules Section */}
            <div className="flex-1 bg-slate-900 p-6 rounded-xl text-sm text-slate-300 border border-slate-700/50 overflow-y-auto max-h-[70vh]">
              <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Info className="text-purple-400"/> Game Rules & Combos</h4>
              <div className="space-y-3">
                <p><strong className="text-white">Pairs:</strong> 1.5x Multiplier</p>
                <p><strong className="text-white">Three of a kind:</strong> 2.5x Multiplier</p>
                <p><strong className="text-white">Flush:</strong> 3.0x Multiplier</p>
                <p><strong className="text-white">Full House:</strong> 4.0x Multiplier</p>
                <p className="mt-2 text-yellow-400 border-t border-slate-700 pt-3">Every 100 Pts: Random Power-Up (Max 3 Slots)</p>
                <p className="text-green-400">Every 200 Pts: +20 HP Instantly</p>
              </div>
              <h4 className="text-xl font-bold text-white mt-6 mb-4 flex items-center gap-2"><Zap className="text-amber-400"/> Power Cards</h4>
              <div className="space-y-2 text-xs">
                {Object.entries(POWERUP_DESCRIPTIONS).map(([name, desc]) => (
                  <p key={name}><strong className="text-amber-400">{name}:</strong> {desc}</p>
                ))}
              </div>
            </div>
            
            {/* Actions Section */}
            <div className="flex-1 flex flex-col justify-center gap-4">
              <h3 className="text-3xl font-bold text-white mb-2 text-center">Game Paused</h3>
              <button onClick={() => {
                setIsPaused(false);
                if (!document.fullscreenElement && battleContainerRef.current) {
                  battleContainerRef.current.requestFullscreen().catch(err => console.warn(err));
                }
              }} className="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-white transition-colors flex justify-center items-center gap-2 text-lg shadow-lg">
                <Play className="w-6 h-6"/> Resume Game
              </button>
              <button onClick={exitMatch} className="w-full py-4 bg-red-600/20 hover:bg-red-600/40 border border-red-500/50 rounded-xl font-bold text-red-400 transition-colors mt-2">
                Exit Game (Forfeit)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP HUD */}
      {/* Top Left: Opponent Score */}
      <div className="absolute top-6 left-6 z-30 bg-slate-900/60 p-4 rounded-2xl border border-red-500/30 backdrop-blur shadow-[0_0_15px_rgba(239,68,68,0.1)] flex items-center gap-4 pointer-events-auto">
        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
          <Crosshair className="text-red-400 w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-bold text-red-400 uppercase tracking-widest">AI Opponent</div>
          <div className="text-2xl font-black text-white">{computerScore}</div>
        </div>
      </div>
      
      {/* Top Right: Pause Button */}
      <div className="absolute top-6 right-6 z-30 pointer-events-auto">
        <button 
          onClick={() => setIsPaused(true)}
          className="bg-slate-900/60 p-4 rounded-2xl border border-slate-600/50 hover:border-slate-400 hover:bg-slate-800/80 backdrop-blur transition-all text-white flex items-center gap-2 shadow-lg"
        >
          <Pause className="w-5 h-5" />
          <span className="font-bold hidden sm:inline">Pause</span>
        </button>
      </div>

      {/* Top Center: AI Concealed Hand */}
      <div className="absolute top-0 sm:top-2 left-1/2 transform -translate-x-1/2 z-10 pointer-events-none">
        <div className="hand-container scale-[0.45] sm:scale-[0.55] origin-top">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="playing-card concealed opacity-50"></div>
          ))}
        </div>
      </div>

      {/* MIDDLE BOARD */}
      <div className="absolute inset-0 z-20 flex flex-col justify-center items-center pointer-events-none px-4 pt-16 pb-[250px]">
        <div className="mb-4 font-bold text-slate-500 tracking-widest bg-slate-900/50 px-4 py-1 rounded-full text-sm pointer-events-auto shadow-md">
          ROUND {currentRound} / {isExtended ? 10 : 5}
        </div>
        
        {roundState === 'loading' && (
          <div className="animate-pop-in flex flex-col items-center justify-center bg-slate-900/80 p-8 rounded-3xl border border-slate-700 pointer-events-auto shadow-xl">
            <RefreshCw className="animate-spin text-purple-400 w-12 h-12 mb-4" />
            <h3 className="text-xl font-bold text-white">Generating Question...</h3>
          </div>
        )}

        {roundState === 'playing' && (
          <div className="animate-pop-in flex flex-col items-center w-full max-w-3xl pointer-events-auto">
            <div className={`timer-circle mb-6 ${timer <= 5 ? 'warning' : ''}`}>
              {timer}
            </div>
            <div className="question-board bg-slate-900/90 shadow-2xl border border-indigo-500/30 w-full p-6 sm:p-8 rounded-3xl text-center">
              <h3 className="text-xl sm:text-2xl font-semibold text-white leading-snug">{question?.promptText}</h3>
            </div>
            <div className="flex justify-center w-full mt-6 sm:mt-8">
              <button 
                 onClick={() => handlePlayCards(selectedCards)}
                 disabled={selectedCards.length === 0}
                 className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 sm:py-4 px-10 sm:px-12 rounded-full text-lg sm:text-xl shadow-[0_0_30px_rgba(147,51,234,0.4)] transition-transform hover:scale-105 active:scale-95"
              >
                 Play Hand ({selectedCards.length})
              </button>
            </div>
          </div>
        )}

        {roundState === 'resolving' && (
          <div className="resolution-area animate-pop-in flex items-center justify-center w-full gap-4 sm:gap-8 pointer-events-auto mt-4">
            {/* Player's Played Cards */}
            <div className="flex flex-col items-center flex-1 relative">
              {comboName && comboMultiplier > 1 && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-in zoom-in-75 slide-in-from-bottom-8 duration-500">
                  <div className="bg-black/80 border-2 border-amber-500 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.6)] backdrop-blur-sm transform -rotate-2 flex flex-col items-center">
                    <div className="text-amber-400 font-black text-3xl sm:text-4xl uppercase tracking-wider drop-shadow-lg">{comboName}</div>
                    <div className="text-white font-bold text-lg sm:text-xl text-center mt-1">{comboMultiplier}x MULTIPLIER</div>
                  </div>
                </div>
              )}
              {comboMultiplier === 0 && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-in zoom-in-75 slide-in-from-top-8 duration-500">
                  <div className="bg-red-900/90 border-2 border-red-500 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.6)] backdrop-blur-sm transform rotate-2 flex flex-col items-center">
                    <div className="text-red-400 font-black text-3xl sm:text-4xl uppercase tracking-wider drop-shadow-lg">{comboName || "COMBO BROKEN"}</div>
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-center flex-wrap">
                {playedCards.map(c => (
                  <div key={c.id} className={`playing-card scale-[0.55] sm:scale-[0.65] origin-top ${c.type === 'POWER_UP' ? 'powerup-card' : 'concept-card'} shadow-2xl mx-[-10px] animate-in slide-in-from-bottom-8 fade-in duration-500`}>
                    <div className="card-title text-xs sm:text-sm mt-8 line-clamp-3" title={c.name}>{c.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-4xl sm:text-5xl font-black text-white/20 px-2 sm:px-4 italic">VS</div>

            {/* Computer's Played Cards */}
            <div className="flex flex-col items-center flex-1 relative">
              {computerComboName && computerComboMultiplier > 1 && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-in zoom-in-75 slide-in-from-top-8 duration-500 delay-300">
                  <div className="bg-black/80 border-2 border-amber-500 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.6)] backdrop-blur-sm transform rotate-2 flex flex-col items-center">
                    <div className="text-amber-400 font-black text-3xl sm:text-4xl uppercase tracking-wider drop-shadow-lg">{computerComboName}</div>
                    <div className="text-white font-bold text-lg sm:text-xl text-center mt-1">{computerComboMultiplier}x MULTIPLIER</div>
                  </div>
                </div>
              )}
              {computerComboMultiplier === 0 && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-in zoom-in-75 slide-in-from-bottom-8 duration-500 delay-300">
                  <div className="bg-red-900/90 border-2 border-red-500 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.6)] backdrop-blur-sm transform -rotate-2 flex flex-col items-center">
                    <div className="text-red-400 font-black text-3xl sm:text-4xl uppercase tracking-wider drop-shadow-lg">{computerComboName || "COMBO BROKEN"}</div>
                  </div>
                </div>
              )}
              {computerPlayedCards.length > 0 ? (
                <div className="flex gap-2 justify-center flex-wrap">
                  {computerPlayedCards.map(c => (
                    <div key={c.id} className={`playing-card scale-[0.55] sm:scale-[0.65] origin-top ${c.type === 'POWER_UP' ? 'powerup-card' : 'concept-card'} shadow-2xl mx-[-10px] animate-in slide-in-from-top-8 fade-in duration-500 delay-300 fill-mode-backwards`}>
                      <div className="card-title text-xs sm:text-sm mt-8 line-clamp-3" title={c.name}>{c.name}</div>
                      <div className={`absolute bottom-4 left-0 right-0 text-center text-[10px] font-bold ${c.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                        {c.isCorrect ? 'CORRECT' : 'INCORRECT'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="playing-card concealed scale-[0.55] sm:scale-[0.65] origin-top"></div>
              )}
            </div>
          </div>
        )}

        {roundState === 'resolving' && computerPlayedCards.length > 0 && (
          <div className="mt-4 sm:mt-8 bg-slate-900/90 px-6 sm:px-8 py-2 sm:py-3 rounded-full border border-slate-700 animate-pop-in shadow-2xl pointer-events-auto">
            <span className="text-white font-bold text-base sm:text-lg">{roundResultText}</span>
          </div>
        )}
      </div>

      {/* Extend Match Prompt Overlay (Radix UI Dialog) */}
      <Dialog open={roundState === 'extend_prompt'} onOpenChange={() => {}}>
        <DialogContent container={battleContainerRef.current} className="bg-slate-900 border border-purple-500/50 text-white max-w-xl p-8 rounded-3xl shadow-[0_0_50px_rgba(147,51,234,0.3)] z-50">
          <DialogHeader className="text-center">
            <DialogTitle className="text-4xl font-extrabold text-white mb-2">5 Rounds Complete!</DialogTitle>
            <DialogDescription className="text-slate-300 text-lg leading-relaxed mt-2">
              You have survived the initial phase! Would you like to conclude the match now with your current score, or extend (+5 rounds) for a hard cap of 10 total rounds?
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-6">
            <button 
              onClick={handleExtendBattle}
              disabled={isActionSubmitting}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl transition-transform hover:scale-[1.02] text-xl shadow-lg flex items-center justify-center gap-2"
            >
              {isActionSubmitting ? (
                <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              ) : (
                <Zap className="w-6 h-6 text-amber-400 fill-amber-400" />
              )}
              {isActionSubmitting ? "Extending Match..." : "Extend to 10 Rounds (+5)"}
            </button>
            <button 
              onClick={handleConcludeBattle}
              disabled={isActionSubmitting}
              className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 font-bold py-4 px-8 rounded-2xl transition-colors text-lg"
            >
              Conclude Match & Summary
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* BOTTOM HUD */}
      
      {/* Bottom Left: Power-ups Inventory */}
      <div className="absolute bottom-6 left-4 sm:left-6 z-30 flex flex-col pointer-events-auto">
        <span className="text-amber-400 font-bold tracking-widest uppercase mb-2 text-[10px] sm:text-xs drop-shadow-md">Power-Up Slots (Max 3)</span>
        <div className="flex gap-2">
          {[0, 1, 2].map((slotIdx) => {
            const powerup = inventory[slotIdx];
            if (powerup) {
              const isSelected = selectedPowerUpSlot === slotIdx;
              return (
                <div 
                  key={slotIdx} 
                  onClick={() => {
                    if (roundState === 'playing') {
                       setSelectedPowerUpSlot(prev => prev === slotIdx ? null : slotIdx);
                    }
                  }}
                  className={`group relative flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-600 rounded-xl cursor-pointer transition-all ${isSelected ? 'ring-2 ring-amber-400 -translate-y-2 sm:-translate-y-4 scale-110 shadow-[0_0_20px_rgba(245,158,11,0.6)]' : 'hover:-translate-y-2 hover:border-slate-400 shadow-lg'}`}
                  style={{ width: '60px', height: '80px' }}
                >
                  <div className="text-amber-400 mb-1"><Zap size={20}/></div>
                  <div className="text-[9px] sm:text-[10px] font-black text-center text-white leading-tight px-1">{powerup}</div>
                  
                  {/* Tooltip popup */}
                  <div className="absolute bottom-[110%] left-0 w-48 p-2 bg-slate-900 border border-amber-500/50 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 flex flex-col gap-1">
                    <span className="text-amber-400 font-bold text-xs">{powerup}</span>
                    <span className="text-slate-300 text-[10px] leading-tight text-left">{POWERUP_DESCRIPTIONS[powerup] || powerup}</span>
                  </div>
                </div>
              );
            }
            return (
              <div 
                key={slotIdx}
                className="w-[60px] h-[80px] border-2 border-dashed border-slate-700/80 bg-slate-900/40 rounded-xl flex flex-col items-center justify-center text-slate-500 text-[10px] sm:text-xs text-center p-1 backdrop-blur-sm shadow-inner"
                title={`Slot ${slotIdx + 1}: Empty`}
              >
                <span className="text-slate-500 font-bold mb-1">Slot {slotIdx + 1}</span>
                <span className="text-[9px] text-slate-600">Empty</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Right: Player Score */}
      <div className="absolute bottom-6 right-4 sm:right-6 z-30 flex flex-col items-end pointer-events-auto bg-slate-900/60 p-3 sm:p-4 rounded-2xl border border-green-500/30 backdrop-blur shadow-[0_0_15px_rgba(74,222,128,0.1)]">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-right">
            <div className="text-[10px] sm:text-xs font-bold text-green-400 uppercase tracking-widest flex items-center justify-end gap-2">
              Player (You) {isCounterActive && <Swords className="text-orange-500 w-3 h-3 animate-pulse" title="Quick Counter Active"/>}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">{playerScore}</div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-500/20 flex items-center justify-center relative">
            <Shield className="text-green-400 w-5 h-5 sm:w-6 sm:h-6" />
            {isCounterActive && <div className="absolute -top-1 -right-1 bg-orange-500 rounded-full p-[2px] shadow-[0_0_10px_rgba(249,115,22,0.8)]"><Swords className="w-3 h-3 text-white"/></div>}
          </div>
        </div>
        <div className="mt-2 text-[10px] sm:text-xs text-slate-300 bg-slate-800/80 px-2 py-1 rounded w-full text-center">
          Bet Pool: <span className="text-purple-400 font-bold">{baitedHp * 2} HP</span>
        </div>
      </div>

      {/* Bottom Center: Player Hand Cards */}
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-4xl flex justify-center pointer-events-auto">
        <div className="hand-container pb-2 sm:pb-6 transform origin-bottom scale-[0.7] sm:scale-100 flex-wrap sm:flex-nowrap px-4 w-full justify-center">
          {playerHand.map((card) => (
            <div 
              key={card.id} 
              onClick={() => {
                if (roundState === 'playing') {
                  if (selectedCards.some(sc => sc.id === card.id)) {
                     setSelectedCards(selectedCards.filter(sc => sc.id !== card.id));
                  } else {
                     setSelectedCards([...selectedCards, card]);
                  }
                }
              }}
              className={`playing-card ${card.type === 'POWER_UP' ? 'powerup-card' : 'concept-card'} 
                         ${selectedCards.some(sc => sc.id === card.id) ? 'selected ring-4 ring-purple-500 transform -translate-y-4 sm:-translate-y-6 scale-105 sm:scale-110 shadow-[0_0_30px_rgba(147,51,234,0.4)] z-20 animate-in zoom-in-[1.02] duration-200' : 'hover:-translate-y-2 z-10'} 
                         ${roundState !== 'playing' ? 'disabled opacity-75' : ''} transition-all duration-200 cursor-pointer mx-0 sm:mx-1`}
            >
              <div className="card-type text-left w-full mb-1 sm:mb-2">
                {card.type === 'POWER_UP' ? (
                  <span className="flex items-center gap-1 text-amber-500"><Zap size={12}/> Power-Up</span>
                ) : 'Concept'}
              </div>
              <div className="card-title line-clamp-3 text-xs sm:text-sm" title={card.name}>{card.name}</div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 sm:mt-2 leading-snug flex-1 line-clamp-4" title={card.description}>
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
