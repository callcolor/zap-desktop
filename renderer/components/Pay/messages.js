import { defineMessages } from 'react-intl'

/* eslint-disable max-len */
export default defineMessages({
  calculating: 'calculating…',
  current_balance: 'Your current confirmed balance:',
  error_not_enough_funds: 'You do not have enough funds available to make this payment.',
  request_label_combined: 'Payment Request, Address, or Node Pubkey',
  request_label_offchain: 'Payment Request',
  request_label_onchain: 'Address',
  request_label_pubkey: 'Node Pubkey',
  searching_routes: 'searching for routes…',
  no_route_tooltip:
    'Unable to find payment route. You can try sending the payment anyway and fees will be capped at your configured payment fee limit, which you can edit in your preferences.',
  subtitle_onchain: 'On-Chain Payment',
  subtitle_offchain: 'Lightning Payment',
  next_block_confirmation: 'next block confirmation',
  next: 'Next',
  back: 'Back',
  send: 'Send',
  send_all: 'Send all',
  fee: 'Fee',
  fee_less_than_1: 'less than 1 satoshi',
  fee_range: 'between {minFee} and {maxFee} satoshis',
  fee_upto: 'up to {maxFee} satoshi',
  fee_unknown: 'unknown',
  fee_per_byte: 'per byte',
  fee_config_limit: 'unknown (up to {maxFee} satoshi)',
  fee_subtraction: 'Deducted from total',
  fee_addition: 'Added to total',
  amount: 'Amount',
  total: 'Total',
  memo: 'Memo',
  sweep_funds: 'Send all of your funds',
  description:
    'Paste a Lightning Payment Request or a {chain} address in the field below to send {chain} ({ticker}) through the Lightning Network or make an On-Chain Transaction.',
  error_not_onetime_send_capacity:
    'You are trying to send more than your current one time send capacity of {capacity} {unit}',
  onchain_balance: '{amount} {cryptoUnitName} (onchain)',
  lightning_balance: '{amount} {cryptoUnitName} (in channels)',
})
