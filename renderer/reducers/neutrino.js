import { send } from 'redux-electron-ipc'
import { createSelector } from 'reselect'
import { neutrinoService } from 'workers'
import { proxyValue } from 'comlinkjs'
import { showSystemNotification } from '@zap/utils/notifications'
import { setHasSynced } from './info'

// ------------------------------------
// Constants
// ------------------------------------

export const START_NEUTRINO = 'START_NEUTRINO'
export const START_NEUTRINO_SUCCESS = 'START_NEUTRINO_SUCCESS'
export const START_NEUTRINO_FAILURE = 'START_NEUTRINO_FAILURE'

export const STOP_NEUTRINO = 'STOP_NEUTRINO'
export const STOP_NEUTRINO_SUCCESS = 'STOP_NEUTRINO_SUCCESS'
export const STOP_NEUTRINO_FAILURE = 'STOP_NEUTRINO_FAILURE'

export const RECEIVE_CURRENT_BLOCK_HEIGHT = 'RECEIVE_CURRENT_BLOCK_HEIGHT'
export const RECEIVE_LND_BLOCK_HEIGHT = 'RECEIVE_LND_BLOCK_HEIGHT'
export const RECEIVE_LND_CFILTER_HEIGHT = 'RECEIVE_LND_CFILTER_HEIGHT'

export const SET_SYNC_STATUS_PENDING = 'SET_SYNC_STATUS_PENDING'
export const SET_SYNC_STATUS_WAITING = 'SET_SYNC_STATUS_WAITING'
export const SET_SYNC_STATUS_IN_PROGRESS = 'SET_SYNC_STATUS_IN_PROGRESS'
export const SET_SYNC_STATUS_COMPLETE = 'SET_SYNC_STATUS_COMPLETE'

export const SET_GRPC_ACTIVE_INTERFACE = 'SET_GRPC_ACTIVE_INTERFACE'

export const NEUTRINO_CRASHED = 'NEUTRINO_CRASHED'
export const NEUTRINO_RESET = 'NEUTRINO_RESET'

// ------------------------------------
// Actions
// ------------------------------------

export const setGrpcActiveInterface = grpcActiveInterface => {
  return {
    type: SET_GRPC_ACTIVE_INTERFACE,
    grpcActiveInterface,
  }
}

export const neutrinoCrashed = ({ code, signal, lastError }) => {
  return {
    type: NEUTRINO_CRASHED,
    code,
    signal,
    lastError,
  }
}

export const neutrinoReset = () => {
  return {
    type: NEUTRINO_RESET,
  }
}

export const initNeutrino = () => async (dispatch, getState) => {
  const neutrino = await neutrinoService

  neutrino.on(
    'NEUTRINO_WALLET_UNLOCKER_GRPC_ACTIVE',
    proxyValue(() => {
      dispatch(setGrpcActiveInterface('walletUnlocker'))
    })
  )
  neutrino.on(
    'NEUTRINO_LIGHTNING_GRPC_ACTIVE',
    proxyValue(() => {
      dispatch(setGrpcActiveInterface('lightning'))
    })
  )

  // Hook up event listeners for process termination.
  neutrino.on(
    'NEUTRINO_EXIT',
    proxyValue(data => {
      // Notify the main process that the process has terminated.
      dispatch(send('processExit', { name: 'neutrino', ...data }))

      // If the netrino process didn't terminate as a result of us asking it TO stop then it must have crashed.
      const { isStoppingNeutrino } = getState().neutrino
      if (!isStoppingNeutrino) {
        dispatch(neutrinoCrashed(data))
      }
    })
  )

  // Hook up event listeners for sync progress updates.
  neutrino.on(
    'NEUTRINO_GOT_CURRENT_BLOCK_HEIGHT',
    proxyValue(height => dispatch(currentBlockHeight(height)))
  )
  neutrino.on(
    'NEUTRINO_GOT_LND_BLOCK_HEIGHT',
    proxyValue(height => dispatch(neutrinoBlockHeight(height)))
  )
  neutrino.on(
    'NEUTRINO_GOT_LND_CFILTER_HEIGHT',
    proxyValue(height => dispatch(neutrinoCfilterHeight(height)))
  )

  // Hook up event listeners for sync status updates.
  neutrino.on(
    'NEUTRINO_CHAIN_SYNC_PENDING',
    proxyValue(() => dispatch(neutrinoSyncStatus('NEUTRINO_CHAIN_SYNC_PENDING')))
  )
  neutrino.on(
    'NEUTRINO_CHAIN_SYNC_WAITING',
    proxyValue(() => dispatch(neutrinoSyncStatus('NEUTRINO_CHAIN_SYNC_WAITING')))
  )
  neutrino.on(
    'NEUTRINO_CHAIN_SYNC_IN_PROGRESS',
    proxyValue(() => dispatch(neutrinoSyncStatus('NEUTRINO_CHAIN_SYNC_IN_PROGRESS')))
  )
  neutrino.on(
    'NEUTRINO_CHAIN_SYNC_COMPLETE',
    proxyValue(() => dispatch(neutrinoSyncStatus('NEUTRINO_CHAIN_SYNC_COMPLETE')))
  )
}

export const startNeutrino = lndConfig => async (dispatch, getState) => {
  const { isStartingNeutrino } = getState().neutrino
  if (isStartingNeutrino) {
    return
  }

  dispatch({ type: START_NEUTRINO })

  const neutrino = await neutrinoService
  try {
    // Initialise the Neutrino service.
    await neutrino.init(lndConfig)

    const waitForWalletUnlocker = new Promise((resolve, reject) => {
      // If the services shuts down in the middle of starting up, abort the start process.
      neutrino.on(
        'NEUTRINO_SHUTDOWN',
        proxyValue(() => {
          neutrino.removeAllListeners('NEUTRINO_SHUTDOWN')
          reject(new Error('Nuetrino was shut down mid-startup.'))
        })
      )
      // Resolve as soon as the wallet unlocker interfave is active.
      neutrino.on(
        'NEUTRINO_WALLET_UNLOCKER_GRPC_ACTIVE',
        proxyValue(() => {
          neutrino.removeAllListeners('NEUTRINO_SHUTDOWN')
          resolve()
        })
      )
    })

    const pid = await neutrino.start()

    // Notify the main process of the pid of the active lnd process.
    // This allows the main process to force terminate the process if it needs to.
    dispatch(send('processSpawn', { name: 'neutrino', pid }))

    //Wait for the wallet unlocker service to become available before notifying of a successful start.
    await waitForWalletUnlocker
    dispatch(startNeutrinoSuccess())
  } catch (error) {
    dispatch(startNeutrinoFailure(error))

    // Rethrow the error so that callers of this method are able to handle errors themselves.
    throw error
  } finally {
    // Finally, Remove the shutdown listener.
    neutrino.removeAllListeners('NEUTRINO_SHUTDOWN')
  }
}

export const startNeutrinoSuccess = () => {
  return { type: START_NEUTRINO_SUCCESS }
}

export const startNeutrinoFailure = startNeutrinoError => {
  return { type: START_NEUTRINO_FAILURE, startNeutrinoError }
}

export const stopNeutrino = () => async (dispatch, getState) => {
  const { isStoppingNeutrino } = getState().neutrino
  if (isStoppingNeutrino) {
    return
  }

  dispatch({ type: STOP_NEUTRINO })

  try {
    const neutrino = await neutrinoService

    // Remove grpc interface activation listeners prior to shutdown.
    neutrino.removeAllListeners('NEUTRINO_WALLET_UNLOCKER_GRPC_ACTIVE')
    neutrino.removeAllListeners('NEUTRINO_LIGHTNING_GRPC_ACTIVE')

    // Shut down the service.
    await neutrino.shutdown()

    dispatch({ type: STOP_NEUTRINO_SUCCESS })
  } catch (error) {
    dispatch({ type: STOP_NEUTRINO_FAILURE, stopNeutrinoError: error })
  }
}

// Receive current block height.
export const currentBlockHeight = height => dispatch => {
  dispatch({ type: RECEIVE_CURRENT_BLOCK_HEIGHT, blockHeight: height })
}

// Receive LND block height.
export const neutrinoBlockHeight = height => dispatch => {
  dispatch({ type: RECEIVE_LND_BLOCK_HEIGHT, neutrinoBlockHeight: height })
}

// Receive LND cfilter height.
export const neutrinoCfilterHeight = height => dispatch => {
  dispatch({ type: RECEIVE_LND_CFILTER_HEIGHT, neutrinoCfilterHeight: height })
}

// Receive LND sync status change.
export const neutrinoSyncStatus = status => async dispatch => {
  const notifTitle = 'Lightning Node Synced'
  const notifBody = "Visa who? You're your own payment processor now!"

  switch (status) {
    case 'NEUTRINO_CHAIN_SYNC_WAITING':
      dispatch({ type: SET_SYNC_STATUS_WAITING })
      break
    case 'NEUTRINO_CHAIN_SYNC_IN_PROGRESS':
      dispatch({ type: SET_SYNC_STATUS_IN_PROGRESS })
      break
    case 'NEUTRINO_CHAIN_SYNC_COMPLETE':
      dispatch({ type: SET_SYNC_STATUS_COMPLETE })

      // Persist the fact that the wallet has been synced at least once.
      dispatch(setHasSynced(true))

      // HTML 5 desktop notification for the new transaction
      showSystemNotification(notifTitle, notifBody)
      break
    case 'NEUTRINO_CHAIN_SYNC_PENDING':
      dispatch({ type: SET_SYNC_STATUS_PENDING })
  }
}

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [START_NEUTRINO]: state => ({
    ...state,
    isStartingNeutrino: true,
    startNeutrinoError: null,
  }),
  [START_NEUTRINO_SUCCESS]: state => ({
    ...state,
    isStartingNeutrino: false,
    isNeutrinoRunning: true,
    startNeutrinoError: null,
  }),
  [START_NEUTRINO_FAILURE]: (state, { startNeutrinoError }) => ({
    ...state,
    isStartingNeutrino: false,
    startNeutrinoError,
  }),

  [STOP_NEUTRINO]: state => ({
    ...state,
    isStoppingNeutrino: true,
    stopNeutrinoError: null,
  }),
  [STOP_NEUTRINO_SUCCESS]: state => ({
    ...state,
    ...initialState,
  }),
  [STOP_NEUTRINO_FAILURE]: (state, { stopNeutrinoError }) => ({
    ...state,
    ...initialState,
    stopNeutrinoError,
  }),

  [RECEIVE_CURRENT_BLOCK_HEIGHT]: (state, { blockHeight }) => ({
    ...state,
    blockHeight,
  }),
  [RECEIVE_LND_BLOCK_HEIGHT]: (state, { neutrinoBlockHeight }) => ({
    ...state,
    neutrinoBlockHeight,
    neutrinoFirstBlockHeight: state.neutrinoFirstBlockHeight || neutrinoBlockHeight,
  }),
  [RECEIVE_LND_CFILTER_HEIGHT]: (state, { neutrinoCfilterHeight }) => ({
    ...state,
    neutrinoCfilterHeight,
    neutrinoFirstCfilterHeight: state.neutrinoFirstCfilterHeight || neutrinoCfilterHeight,
  }),

  [SET_SYNC_STATUS_PENDING]: state => ({ ...state, syncStatus: 'pending' }),
  [SET_SYNC_STATUS_WAITING]: state => ({ ...state, syncStatus: 'waiting' }),
  [SET_SYNC_STATUS_IN_PROGRESS]: state => ({ ...state, syncStatus: 'in-progress' }),
  [SET_SYNC_STATUS_COMPLETE]: state => ({ ...state, syncStatus: 'complete' }),

  [SET_GRPC_ACTIVE_INTERFACE]: (state, { grpcActiveInterface }) => ({
    ...state,
    grpcActiveInterface,
  }),

  [NEUTRINO_CRASHED]: (state, { code, signal, lastError }) => ({
    ...state,
    ...initialState,
    isNeutrinoCrashed: true,
    neutrinoCrashCode: code,
    neutrinoCrashSignal: signal,
    neutrinoCrashLastError: lastError,
  }),

  [NEUTRINO_RESET]: state => ({
    ...state,
    ...initialState,
  }),
}

// ------------------------------------
// Reducer
// ------------------------------------
const initialState = {
  isNeutrinoRunning: false,
  isStartingNeutrino: false,
  isStoppingNeutrino: false,
  isNeutrinoCrashed: false,
  grpcActiveInterface: null,
  blockHeight: 0,
  neutrinoFirstBlockHeight: 0,
  neutrinoBlockHeight: 0,
  neutrinoFirstCfilterHeight: 0,
  neutrinoCfilterHeight: 0,
  startNeutrinoError: null,
  stopNeutrinoError: null,
  neutrinoCrashCode: null,
  neutrinoCrashSignal: null,
  neutrinoCrashLastError: null,
  syncStatus: 'pending',
}

// ------------------------------------
// Selectors
// ------------------------------------
const isStartingNeutrinoSelector = state => state.neutrino.isStartingNeutrino
const isNeutrinoRunningSelector = state => state.neutrino.isNeutrinoRunning
const neutrinoSyncStatusSelector = state => state.neutrino.syncStatus
const blockHeightSelector = state => state.neutrino.blockHeight
const neutrinoBlockHeightSelector = state => state.neutrino.neutrinoBlockHeight
const neutrinoFirstBlockHeightSelector = state => state.neutrino.neutrinoFirstBlockHeight
const neutrinoCfilterHeightSelector = state => state.neutrino.neutrinoCfilterHeight
const neutrinoFirstCfilterHeightSelector = state => state.neutrino.neutrinoFirstCfilterHeight
const isNeutrinoCrashedSelector = state => state.neutrino.isNeutrinoCrashed
const neutrinoCrashCodeSelector = state => state.neutrino.neutrinoCrashCode
const neutrinoCrashSignalSelector = state => state.neutrino.neutrinoCrashSignal
const neutrinoCrashLastErrorSelector = state => state.neutrino.neutrinoCrashLastError

const neutrinoSelectors = {}
neutrinoSelectors.isStartingNeutrino = isStartingNeutrinoSelector
neutrinoSelectors.isNeutrinoRunning = isNeutrinoRunningSelector
neutrinoSelectors.neutrinoSyncStatus = neutrinoSyncStatusSelector
neutrinoSelectors.blockHeight = blockHeightSelector
neutrinoSelectors.neutrinoBlockHeight = neutrinoBlockHeightSelector
neutrinoSelectors.neutrinoCfilterHeight = neutrinoCfilterHeightSelector

neutrinoSelectors.neutrinoSyncPercentage = createSelector(
  blockHeightSelector,
  neutrinoBlockHeightSelector,
  neutrinoFirstBlockHeightSelector,
  neutrinoCfilterHeightSelector,
  neutrinoFirstCfilterHeightSelector,
  (
    blockHeight,
    neutrinoBlockHeight,
    neutrinoFirstBlockHeight,
    neutrinoCfilterHeight,
    neutrinoFirstCfilterHeight
  ) => {
    // blocks
    const blocksToSync = blockHeight - neutrinoFirstBlockHeight
    const blocksRemaining = blockHeight - neutrinoBlockHeight
    const blocksDone = blocksToSync - blocksRemaining

    // filters
    const filtersToSync = blockHeight - neutrinoFirstCfilterHeight
    const filtersRemaining = blockHeight - neutrinoCfilterHeight
    const filtersDone = filtersToSync - filtersRemaining

    // totals
    const totalToSync = blocksToSync + filtersToSync
    const done = blocksDone + filtersDone

    const percentage = Math.floor((done / totalToSync) * 100)

    if (percentage === Infinity || Number.isNaN(percentage)) {
      return undefined
    }

    return parseInt(percentage, 10)
  }
)

neutrinoSelectors.isNeutrinoCrashed = isNeutrinoCrashedSelector

neutrinoSelectors.neutrinoCrashReason = createSelector(
  neutrinoCrashCodeSelector,
  neutrinoCrashSignalSelector,
  neutrinoCrashLastErrorSelector,
  (code, signal, error) => ({
    code,
    signal,
    error,
  })
)

export { neutrinoSelectors }

// ------------------------------------
// Reducer
// ------------------------------------
//
export default function neutrinoReducer(state = initialState, action) {
  const handler = ACTION_HANDLERS[action.type]

  return handler ? handler(state, action) : state
}