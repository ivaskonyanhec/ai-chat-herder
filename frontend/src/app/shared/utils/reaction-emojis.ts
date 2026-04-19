export interface EmojiCategory {
  label: string;
  emojis: string[];
}

export const REACTION_EMOJIS: EmojiCategory[] = [
  {
    label: 'Smileys',
    emojis: ['😀', '😂', '😍', '🤔', '😎', '😢', '😡', '🥳', '😅', '🤯'],
  },
  {
    label: 'Gestures',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '✌️', '🤞', '👀', '💪'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❤️‍🔥'],
  },
  {
    label: 'Objects',
    emojis: ['🔥', '⭐', '💯', '✅', '❌', '⚡', '🎉', '🚀', '💡', '🔔'],
  },
];

export const EMOJI_NAMES: Record<string, string> = {
  '😀': 'grinning', '😂': 'joy', '😍': 'heart_eyes', '🤔': 'thinking',
  '😎': 'sunglasses', '😢': 'cry', '😡': 'rage', '🥳': 'partying_face',
  '😅': 'sweat_smile', '🤯': 'exploding_head',
  '👍': 'thumbsup', '👎': 'thumbsdown', '👏': 'clap', '🙌': 'raised_hands',
  '🤝': 'handshake', '🙏': 'pray', '✌️': 'v', '🤞': 'crossed_fingers',
  '👀': 'eyes', '💪': 'muscle',
  '❤️': 'heart', '🧡': 'orange_heart', '💛': 'yellow_heart', '💚': 'green_heart',
  '💙': 'blue_heart', '💜': 'purple_heart', '🖤': 'black_heart', '🤍': 'white_heart',
  '💔': 'broken_heart', '❤️‍🔥': 'heart_on_fire',
  '🔥': 'fire', '⭐': 'star', '💯': '100', '✅': 'white_check_mark',
  '❌': 'x', '⚡': 'zap', '🎉': 'tada', '🚀': 'rocket', '💡': 'bulb', '🔔': 'bell',
};
