"""
Q-Learning Agent for Day Trading

Maintains a Q-table mapping (state, action) pairs to expected rewards.
Uses epsilon-greedy to balance exploration vs exploitation.
"""

import random
import numpy as np
from typing import Dict, Tuple, Optional, List
from .state import TradingState


class QLearningAgent:
    """Decides BUY/SELL/HOLD based on learned Q-values. Learns from realized P&L."""

    ACTIONS = ['BUY', 'SELL', 'HOLD']

    def __init__(
        self,
        learning_rate: float = 0.1,
        discount_factor: float = 0.95,
        exploration_rate: float = 1.0,
        exploration_decay: float = 0.99,
        min_exploration: float = 0.01
    ):
        self.learning_rate = learning_rate
        self.discount_factor = discount_factor
        self.exploration_rate = exploration_rate
        self.exploration_decay = exploration_decay
        self.min_exploration = min_exploration

        self.q_table: Dict[Tuple, Dict[str, float]] = {}
        self.total_episodes = 0
        self.total_rewards = 0.0

    def get_q_value(self, state: TradingState, action: str) -> float:
        """Returns Q-value for (state, action). Initializes to 0 if unseen."""
        state_tuple = state.to_tuple()

        if state_tuple not in self.q_table:
            self.q_table[state_tuple] = {a: 0.0 for a in self.ACTIONS}

        return self.q_table[state_tuple][action]

    def get_q_values(self, state: TradingState) -> Dict[str, float]:
        """Returns dict of Q-values for all actions in current state."""
        return {action: self.get_q_value(state, action) for action in self.ACTIONS}

    def get_best_action(self, state: TradingState) -> str:
        """Returns action with highest Q-value."""
        q_values = {action: self.get_q_value(state, action) for action in self.ACTIONS}
        return max(q_values, key=q_values.get)

    def choose_action(self, state: TradingState, force_exploit: bool = False) -> Tuple[str, bool]:
        """Epsilon-greedy action selection. Returns (action, was_random)."""
        if force_exploit:
            return self.get_best_action(state), False

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
        Standard Q-learning update: Q(s,a) += α * [R + γ * max Q(s',a') - Q(s,a)]
        """
        current_q = self.get_q_value(state, action)

        if done:
            target_q = reward
        else:
            next_q_values = [self.get_q_value(next_state, a) for a in self.ACTIONS]
            max_next_q = max(next_q_values)
            target_q = reward + self.discount_factor * max_next_q

        new_q = current_q + self.learning_rate * (target_q - current_q)

        state_tuple = state.to_tuple()
        if state_tuple not in self.q_table:
            self.q_table[state_tuple] = {a: 0.0 for a in self.ACTIONS}
        self.q_table[state_tuple][action] = new_q

        self.total_rewards += reward

    def decay_exploration(self):
        """Exponentially decay epsilon toward min_exploration."""
        self.exploration_rate = max(
            self.exploration_rate * self.exploration_decay,
            self.min_exploration
        )

    def finish_episode(self):
        """Call at end of each trading decision to decay epsilon."""
        self.total_episodes += 1
        self.decay_exploration()

    def get_stats(self) -> Dict:
        """Returns dict with episode count, epsilon, avg reward, Q-table size."""
        return {
            'total_episodes': self.total_episodes,
            'exploration_rate': round(self.exploration_rate, 4),
            'exploration_decay': round(self.exploration_decay, 4),
            'avg_reward': round(self.total_rewards / max(self.total_episodes, 1), 2),
            'q_table_size': len(self.q_table),
            'total_rewards': round(self.total_rewards, 2)
        }

    def set_exploration_decay(self, decay: float):
        """Adjust decay rate dynamically (clamped to 0.5-0.999)."""
        self.exploration_decay = max(min(decay, 0.999), 0.5)

    def save(self) -> Dict:
        """Serialize agent state for database persistence."""
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
        """Restore agent from saved state dict."""
        agent = cls(
            learning_rate=data['learning_rate'],
            discount_factor=data['discount_factor'],
            exploration_rate=data['exploration_rate'],
            exploration_decay=data.get('exploration_decay', 0.99),
            min_exploration=data.get('min_exploration', 0.01)
        )

        import ast
        for state_str, actions in data['q_table'].items():
            try:
                state_tuple = ast.literal_eval(state_str)
                agent.q_table[state_tuple] = actions
            except (ValueError, SyntaxError) as e:
                print(f"Warning: Skipping invalid state string: {state_str[:50]}... ({e})")

        agent.total_episodes = data['total_episodes']
        agent.total_rewards = data['total_rewards']
        agent.exploration_decay = data.get('exploration_decay', agent.exploration_decay)
        agent.min_exploration = data.get('min_exploration', agent.min_exploration)
        agent._migrate_old_states()
        return agent

    def _migrate_old_states(self):
        """Migrate legacy 3-bucket RSI states to 5-bucket schema."""
        if not self.q_table:
            return

        rsi_values = {state[0] for state in self.q_table.keys()}
        if 'WEAK' in rsi_values or 'STRONG' in rsi_values:
            return

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


if __name__ == '__main__':
    # Quick test of Q-Learning agent
    print("=== Testing Q-Learning Agent ===\n")

    agent = QLearningAgent(
        learning_rate=0.1,
        discount_factor=0.95,
        exploration_rate=1.0
    )

    print("1. Initial Agent Stats")
    print(f"   {agent.get_stats()}")

    print("\n2. Simulating Profitable Trade")
    state1 = TradingState(
        rsi_category='OVERSOLD',
        ma_position='BELOW',
        vwap_position='ABOVE',
        position_status='FLAT',
        price_momentum='UP'
    )
    print(f"   Current state: {state1}")

    action, was_random = agent.choose_action(state1)
    print(f"   Action chosen: {action} (random={was_random})")

    state2 = TradingState(
        rsi_category='NEUTRAL',
        ma_position='ABOVE',
        vwap_position='ABOVE',
        position_status='LONG',
        price_momentum='UP'
    )
    reward = 5.0
    agent.update_q_value(state1, action, reward, state2, done=True)
    print(f"   Reward: +${reward:.2f}")
    print(f"   Q-value updated: {agent.get_q_value(state1, action):.2f}")

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
    reward2 = -3.0
    agent.update_q_value(state3, action2, reward2, state4, done=True)
    print(f"   Reward: ${reward2:.2f}")
    print(f"   Q-value updated: {agent.get_q_value(state3, action2):.2f}")

    agent.finish_episode()

    print("\n4. Final Agent Stats")
    print(f"   {agent.get_stats()}")
    print(f"   Exploration decayed: {agent.exploration_rate:.4f}")
