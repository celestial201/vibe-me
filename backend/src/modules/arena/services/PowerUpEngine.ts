export interface PowerUpContext {
    battle: any; // BattleSession instance
    currentQuestion: any; // The active question
    player: {
        submittedCards: string[];
        correctConcepts: string[];
        correctCount: number;
        hasMistake: boolean;
        basePoints: number;
        multiplier: number;
        comboName: string;
        shieldUsed: boolean;
        consecutiveWins: number;
    };
    opponent: {
        playedCards: any[]; // The cards the computer played
        correctCount: number;
        hasMistake: boolean;
        basePoints: number;
        multiplier: number;
        comboName: string;
        scoreDelta: number; // Final score to add/subtract
    };
}

export interface PowerUpStrategy {
    apply(context: PowerUpContext): void;
}

class ShieldStrategy implements PowerUpStrategy {
    apply(context: PowerUpContext): void {
        if (context.player.hasMistake) {
            context.player.shieldUsed = true;
            context.player.basePoints = 0; // Prevent point deduction
        }
    }
}

class WildcardStrategy implements PowerUpStrategy {
    apply(context: PowerUpContext): void {
        context.player.correctCount += 1;
    }
}

class QuickCounterStrategy implements PowerUpStrategy {
    apply(context: PowerUpContext): void {
        // "If the player achieves a WIN on the immediate round, apply a permanent global 2x multiplier"
        if (!context.player.hasMistake && context.player.correctCount > 0) {
            context.battle.permanentMultiplier *= 2;
        }
    }
}

class TheJokerStrategy implements PowerUpStrategy {
    apply(context: PowerUpContext): void {
        // Auto-select all correct answers from the deck
        const deck = context.currentQuestion.deck || [];
        const correctCards = deck.filter((c: any) => c.isCorrect).map((c: any) => c.name);
        
        context.player.submittedCards = correctCards;
        context.player.correctCount = correctCards.length;
        context.player.hasMistake = false;
    }
}

class ReversalStrategy implements PowerUpStrategy {
    apply(context: PowerUpContext): void {
        // Invert the round outcome state for the opponent
        context.opponent.scoreDelta = -context.opponent.scoreDelta;
        if (context.opponent.scoreDelta > 0) {
            context.opponent.comboName = "Reversed to Win!";
        } else {
            context.opponent.comboName = "Reversed to Loss!";
        }
    }
}

class BlockerStrategy implements PowerUpStrategy {
    apply(context: PowerUpContext): void {
        context.opponent.scoreDelta = 0;
        context.opponent.multiplier = 0;
        context.opponent.comboName = "Blocked!";
    }
}

export class PowerUpEngine {
    private static strategies: Record<string, PowerUpStrategy> = {
        'Shield': new ShieldStrategy(),
        'Wildcard': new WildcardStrategy(),
        'Quick Counter': new QuickCounterStrategy(),
        'The Joker': new TheJokerStrategy(),
        'Reversal': new ReversalStrategy(),
        'Blocker': new BlockerStrategy()
    };

    public static apply(powerUpId: string, context: PowerUpContext): void {
        const strategy = this.strategies[powerUpId];
        if (strategy) {
            strategy.apply(context);
        } else {
            console.warn(`PowerUpEngine: Strategy not found for powerUpId: ${powerUpId}`);
        }
    }
}
