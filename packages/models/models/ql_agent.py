"""
Q-Learning Agent for Day Trading

- Agent learns by trial and error
- Q-table stores "quality" of (state, action) pairs
- Q(state, action) = expected future reward for taking action in state
- Agent gradually learns which actions work best in each situation

Key Concepts:
- Exploration: Try random actions to discover new strategies
- Exploitation: Use learned Q-values to maximize profit
- Epsilon-greedy: Balance exploration vs exploitation
"""

import random
import numpy as np
from typing import Dict, Tuple, Optional, List
from .state import TradingState


class QLearningAgent:
    """
    The agent learns to:
    - Buy when market conditions suggest upward movement
    - Sell when conditions suggest downward movement or take profit
    - Hold when conditions are uncertain

    Learning happens through rewards:
    - Positive reward: Profitable trade
    - Negative reward: Losing trade
    - Small penalty: Excessive trading (fees)
    """

    # Available actions
    ACTIONS = ['BUY', 'SELL', 'HOLD']

    def __init__(
        self,
        learning_rate: float = 0.1,
        discount_factor: float = 0.95,
        exploration_rate: float = 1.0,
        exploration_decay: float = 0.99,
        min_exploration: float = 0.01
    ):
        """
        Initialize Q-Learning agent.

        Args:
            learning_rate: How much to update Q-values (alpha)
                          0 = no learning, 1 = replace old value completely
                          Typical: 0.1-0.3

            discount_factor: How much to value future rewards (gamma)
                            0 = only immediate rewards matter
                            1 = future rewards matter as much as immediate
                            Typical: 0.9-0.99

            exploration_rate: Initial probability of random action (epsilon)
                             1.0 = always explore (random)
                             0.0 = always exploit (use learned policy)
                             Starts high, decays over time

            exploration_decay: How fast exploration rate decreases
                              0.995 = very slow decay
                              0.99 = medium decay (default)
                              0.95 = fast decay

            min_exploration: Minimum exploration rate
                           Prevents agent from becoming too greedy
                           0.01 = 1% chance of random action (recommended)
        """
        self.learning_rate = learning_rate
        self.discount_factor = discount_factor
        self.exploration_rate = exploration_rate
        self.exploration_decay = exploration_decay
        self.min_exploration = min_exploration

        # Q-table: Maps (state, action) -> expected reward
        # Example: Q[('OVERSOLD', 'ABOVE', 'ABOVE', 'FLAT', 'UP'), 'BUY'] = 5.2
        self.q_table: Dict[Tuple, Dict[str, float]] = {}

        # Learning statistics
        self.total_episodes = 0
        self.total_rewards = 0.0

    def get_q_value(self, state: TradingState, action: str) -> float:
        """
        Get Q-value for (state, action) pair.

        If never seen before, initialize to 0.0 (optimistic initialization).

        Args:
            state: Current trading state
            action: Action ('BUY', 'SELL', 'HOLD')

        Returns:
            Q-value (expected future reward)
        """
        state_tuple = state.to_tuple()

        if state_tuple not in self.q_table:
            self.q_table[state_tuple] = {a: 0.0 for a in self.ACTIONS}

        return self.q_table[state_tuple][action]

    def get_q_values(self, state: TradingState) -> Dict[str, float]:
        """
        Get all Q-values for current state (for all actions).

        Args:
            state: Current trading state

        Returns:
            Dictionary mapping actions to their Q-values
            Example: {'BUY': 2.5, 'SELL': -1.2, 'HOLD': 0.3}
        """
        return {action: self.get_q_value(state, action) for action in self.ACTIONS}

    def get_best_action(self, state: TradingState) -> str:
        """
        Get best action for current state (exploitation).

        Chooses action with highest Q-value.

        Args:
            state: Current trading state

        Returns:
            Best action ('BUY', 'SELL', or 'HOLD')
        """
        q_values = {action: self.get_q_value(state, action) for action in self.ACTIONS}
        best_action = max(q_values, key=q_values.get)
        return best_action

    def choose_action(self, state: TradingState, force_exploit: bool = False) -> Tuple[str, bool]:
        """
        Choose action using epsilon-greedy strategy.

        With probability epsilon: Choose random action (exploration)
        With probability 1-epsilon: Choose best action (exploitation)

        Args:
            state: Current trading state
            force_exploit: If True, always choose best action (for deployment)

        Returns:
            Tuple of (action, was_random)
            - action: 'BUY', 'SELL', or 'HOLD'
            - was_random: True if action was random (exploration)

        Example:
            agent = QLearningAgent(exploration_rate=0.3)
            action, was_random = agent.choose_action(state)
            # 30% chance: random action (exploration)
            # 70% chance: best action based on Q-values (exploitation)
        """
        if force_exploit:
            return self.get_best_action(state), False

        # Epsilon-greedy: Random action with probability epsilon
        if random.random() < self.exploration_rate:
            action = random.choice(self.ACTIONS)
            return action, True
        else:
            return self.get_best_action(state), False

    def update_q_value(
        self,
        state: TradingState,
        action: str,
        reward: float,
        next_state: TradingState,
        done: bool = False
    ):
        """
        Update Q-value using Q-Learning update rule.

        Q-Learning Formula:
            Q(s, a) = Q(s, a) + α * [R + γ * max_a' Q(s', a') - Q(s, a)]

        Where:
            - α (alpha) = learning rate
            - R = immediate reward
            - γ (gamma) = discount factor
            - max_a' Q(s', a') = best future Q-value
            - Q(s, a) = current Q-value

        Args:
            state: Current state before action
            action: Action taken
            reward: Immediate reward received
            next_state: State after action
            done: True if episode ended (position closed)

        Example:
            # Agent bought stock at $100
            state_before = TradingState(...)  # State when bought
            action = 'BUY'

            # Stock went to $105, agent sold for +$5 profit
            reward = 5.0
            next_state = TradingState(...)  # State when sold
            done = True

            agent.update_q_value(state_before, 'BUY', reward, next_state, done)
            # Q-value for (state_before, 'BUY') increases
            # Agent learns: "Buying in this state was good"
        """
        current_q = self.get_q_value(state, action)

        if done:
            # Episode ended, no future rewards
            target_q = reward
        else:
            # Calculate best future Q-value
            next_q_values = [self.get_q_value(next_state, a) for a in self.ACTIONS]
            max_next_q = max(next_q_values)
            target_q = reward + self.discount_factor * max_next_q

        # Q-Learning update rule
        new_q = current_q + self.learning_rate * (target_q - current_q)

        # Update Q-table
        state_tuple = state.to_tuple()
        if state_tuple not in self.q_table:
            self.q_table[state_tuple] = {a: 0.0 for a in self.ACTIONS}
        self.q_table[state_tuple][action] = new_q

        # Update statistics
        self.total_rewards += reward

    def decay_exploration(self):
        """
        Decrease exploration rate (after each episode).

        Agent gradually shifts from exploration to exploitation:
        - Early training: High exploration (discover strategies)
        - Late training: Low exploration (use learned policy)

        Epsilon decays exponentially:
            epsilon_new = max(epsilon * decay, min_epsilon)
        """
        self.exploration_rate = max(
            self.exploration_rate * self.exploration_decay,
            self.min_exploration
        )

    def finish_episode(self):
        """
        Mark episode as complete and decay exploration.

        Call this at end of each trading day.
        """
        self.total_episodes += 1
        self.decay_exploration()

    def get_stats(self) -> Dict:
        """
        Get agent learning statistics.

        Returns:
            Dictionary with:
            - total_episodes: Number of trading sessions completed
            - exploration_rate: Current epsilon value
            - avg_reward: Average reward per episode
            - q_table_size: Number of states learned
        """
        return {
            'total_episodes': self.total_episodes,
            'exploration_rate': round(self.exploration_rate, 4),
            'exploration_decay': round(self.exploration_decay, 4),
            'avg_reward': round(self.total_rewards / max(self.total_episodes, 1), 2),
            'q_table_size': len(self.q_table),
            'total_rewards': round(self.total_rewards, 2)
        }

    def set_exploration_decay(self, decay: float):
        """
        Dynamically adjust exploration decay.

        Used for adaptive scheduling based on win rate or other KPIs.
        """
        decay = max(min(decay, 0.999), 0.5)
        self.exploration_decay = decay

    def save(self) -> Dict:
        """
        Save agent state for persistence.

        Returns:
            Dictionary with Q-table and hyperparameters
        """
        return {
            'q_table': {str(k): v for k, v in self.q_table.items()},
            'learning_rate': self.learning_rate,
            'discount_factor': self.discount_factor,
            'exploration_rate': self.exploration_rate,
            'exploration_decay': self.exploration_decay,
            'min_exploration': self.min_exploration,
            'total_episodes': self.total_episodes,
            'total_rewards': self.total_rewards
        }

    @classmethod
    def load(cls, data: Dict) -> 'QLearningAgent':
        """
        Load agent from saved state.

        Args:
            data: Dictionary from save() method

        Returns:
            Restored QLearningAgent
        """
        agent = cls(
            learning_rate=data['learning_rate'],
            discount_factor=data['discount_factor'],
            exploration_rate=data['exploration_rate'],
            exploration_decay=data.get('exploration_decay', 0.99),
            min_exploration=data.get('min_exploration', 0.01)
        )

        # Restore Q-table (using ast.literal_eval for security)
        import ast
        for state_str, actions in data['q_table'].items():
            try:
                state_tuple = ast.literal_eval(state_str)  # Safe evaluation
                agent.q_table[state_tuple] = actions
            except (ValueError, SyntaxError) as e:
                # Skip malformed state strings
                print(f"Warning: Skipping invalid state string: {state_str[:50]}... ({e})")

        agent.total_episodes = data['total_episodes']
        agent.total_rewards = data['total_rewards']
        agent.exploration_decay = data.get('exploration_decay', agent.exploration_decay)
        agent.min_exploration = data.get('min_exploration', agent.min_exploration)

        # Migrate legacy RSI buckets (3 → 5) so old Q-tables stay usable
        agent._migrate_old_states()

        return agent

    def _migrate_old_states(self):
        """
        Duplicate legacy 3-bucket RSI states into the new 5-bucket schema.
        """
        if not self.q_table:
            return

        rsi_values = {state[0] for state in self.q_table.keys()}
        if 'WEAK' in rsi_values or 'STRONG' in rsi_values:
            return  # Already migrated or freshly trained

        migrated = {}
        migrated_count = 0
        for state, actions in self.q_table.items():
            rsi_bucket = state[0]
            if rsi_bucket == 'NEUTRAL':
                for new_bucket in ('WEAK', 'NEUTRAL', 'STRONG'):
                    migrated[(new_bucket,) + state[1:]] = actions.copy()
                migrated_count += 2  # two new states added beyond original
            else:
                migrated[state] = actions

        self.q_table = migrated
        if migrated_count:
            print(f"[QLearningAgent] Migrated legacy RSI states -> added {migrated_count} entries for finer buckets.")


# Example usage
if __name__ == '__main__':
    """
    Test Q-Learning agent with simulated trading.

    Run: python -m packages.models.models.ql_agent
    """
    print("=== Testing Q-Learning Agent ===\n")

    # Initialize agent
    agent = QLearningAgent(
        learning_rate=0.1,
        discount_factor=0.95,
        exploration_rate=1.0  # Start with full exploration
    )

    print("1. Initial Agent Stats")
    print(f"   {agent.get_stats()}")

    # Simulate a profitable trade
    print("\n2. Simulating Profitable Trade")

    # State: Oversold, bullish conditions
    state1 = TradingState(
        rsi_category='OVERSOLD',
        ma_position='BELOW',
        vwap_position='ABOVE',
        position_status='FLAT',
        price_momentum='UP'
    )
    print(f"   Current state: {state1}")

    # Agent chooses action
    action, was_random = agent.choose_action(state1)
    print(f"   Action chosen: {action} (random={was_random})")

    # Simulate positive outcome
    state2 = TradingState(
        rsi_category='NEUTRAL',
        ma_position='ABOVE',
        vwap_position='ABOVE',
        position_status='LONG',
        price_momentum='UP'
    )
    reward = 5.0  # $5 profit
    agent.update_q_value(state1, action, reward, state2, done=True)
    print(f"   Reward: +${reward:.2f}")
    print(f"   Q-value updated: {agent.get_q_value(state1, action):.2f}")

    # Simulate a losing trade
    print("\n3. Simulating Losing Trade")

    state3 = TradingState(
        rsi_category='OVERBOUGHT',
        ma_position='ABOVE',
        vwap_position='BELOW',
        position_status='FLAT',
        price_momentum='DOWN'
    )
    print(f"   Current state: {state3}")

    action2, was_random2 = agent.choose_action(state3)
    print(f"   Action chosen: {action2} (random={was_random2})")

    state4 = TradingState(
        rsi_category='NEUTRAL',
        ma_position='BELOW',
        vwap_position='BELOW',
        position_status='LONG',
        price_momentum='DOWN'
    )
    reward2 = -3.0  # $3 loss
    agent.update_q_value(state3, action2, reward2, state4, done=True)
    print(f"   Reward: ${reward2:.2f}")
    print(f"   Q-value updated: {agent.get_q_value(state3, action2):.2f}")

    # Finish episode
    agent.finish_episode()

    print("\n4. Final Agent Stats")
    print(f"   {agent.get_stats()}")
    print(f"   Exploration decayed: {agent.exploration_rate:.4f}")
