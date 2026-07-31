const battle = {
    totalPoints: 90,
    hpMilestoneProgress: 0,
    inventory: [] as string[],
    lastPowerCardMilestoneAchieved: 0
};

function processTurn(pointsEarned: number) {
    if (pointsEarned < 0) {
        if (battle.totalPoints + pointsEarned <= 0) {
            pointsEarned = -battle.totalPoints; 
            battle.totalPoints = 0;
        } else {
            battle.totalPoints += pointsEarned;
        }
    } else {
        battle.totalPoints += pointsEarned;
    }

    let triggerHpEvent = false;
    let powerUpGranted = null;
    
    if (pointsEarned > 0) {
        battle.hpMilestoneProgress += pointsEarned;
        
        while (battle.hpMilestoneProgress >= 250) {
            triggerHpEvent = true;
            battle.hpMilestoneProgress -= 250;
        }
        
        // Power-Up Milestone: Every 100 points reached (Max 3 inventory slots)
        const currentMilestone = Math.floor(battle.totalPoints / 100) * 100;
        const lastMilestone = battle.lastPowerCardMilestoneAchieved || 0;
        
        if (currentMilestone >= 100 && currentMilestone > lastMilestone) {
            const milestonesCrossed = Math.floor((currentMilestone - lastMilestone) / 100);
            for (let i = 0; i < milestonesCrossed; i++) {
                if (battle.inventory.length < 3) {
                    const powerUps = ['Shield', 'Wildcard', 'Quick Counter', 'The Joker', 'Reversal', 'Blocker'];
                    powerUpGranted = powerUps[Math.floor(Math.random() * powerUps.length)];
                    battle.inventory.push(powerUpGranted);
                }
            }
            battle.lastPowerCardMilestoneAchieved = currentMilestone;
        }
    }
}

console.log("Initial state:", JSON.stringify(battle));
processTurn(20); 
console.log("After 20 pts (110 total):", JSON.stringify(battle), `Inventory Length: ${battle.inventory.length}`);

processTurn(40); 
console.log("After 40 pts (150 total):", JSON.stringify(battle), `Inventory Length: ${battle.inventory.length}`);

processTurn(60); 
console.log("After 60 pts (210 total):", JSON.stringify(battle), `Inventory Length: ${battle.inventory.length}`);

processTurn(150); 
console.log("After 150 pts (360 total):", JSON.stringify(battle), `Inventory Length: ${battle.inventory.length}`);

// Test multiple at once
battle.totalPoints = 90;
battle.inventory = [];
battle.lastPowerCardMilestoneAchieved = 0;
console.log("\nResetting to 90 points...");
processTurn(130);
console.log("After 130 pts (220 total):", JSON.stringify(battle), `Inventory Length: ${battle.inventory.length} (Should be 2)`);
