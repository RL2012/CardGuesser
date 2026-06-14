export interface Card {
  id: number
  name: string
  frameType: string   // 'normal' | 'effect' | 'ritual' | 'fusion' | 'synchro' | 'xyz' | 'link' | 'spell' | 'trap' | ...
  attribute: string   // 'DARK' | 'LIGHT' | 'FIRE' | 'WATER' | 'EARTH' | 'WIND' | 'DIVINE' | '' for spells/traps
  atk: number | null  // null for spells/traps
  def: number | null  // null for spells/traps and link monsters
  level: number | null // level, rank, or link rating; null for spells/traps
  race: string        // monster race (Dragon, Spellcaster…) or spell/trap sub-type (Normal, Continuous…)
}
