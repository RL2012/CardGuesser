export interface CardSet {
  setName: string
  setCode: string
  setRarity: string
  setPrice: string
  setEdition?: string
}

export interface Card {
  id: number
  name: string
  frameType: string   // 'normal' | 'effect' | 'ritual' | 'fusion' | 'synchro' | 'xyz' | 'link' | 'spell' | 'trap' | ...
  type: string        // full type string, e.g. 'Normal Monster', 'Effect Monster', 'Spell Card', 'Trap Card', 'Pendulum Effect Monster' ...
  attribute: string   // 'DARK' | 'LIGHT' | 'FIRE' | 'WATER' | 'EARTH' | 'WIND' | 'DIVINE' | '' for spells/traps
  atk: number | null  // null for spells/traps
  def: number | null  // null for spells/traps and link monsters
  level: number | null // level, rank, or link rating; null for spells/traps
  race: string        // monster race (Dragon, Spellcaster…) or spell/trap sub-type (Normal, Continuous…)
  archetype: string | null
  cardSets: CardSet[]
  banTcg: string | null  // 'Forbidden' | 'Limited' | 'Semi-Limited' | null (not on list)
  views: number
  viewsWeek: number
  tcgDate: string | null // 'YYYY-MM-DD' or null
  tcgplayerPrice: number | null // TCGPlayer market price in USD; null when unavailable
}
