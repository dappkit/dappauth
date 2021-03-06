import { writable, derived } from "svelte/store"
import { getBlocknative } from "./services"
import { wait, makeQuerablePromise } from "./utilities"
import { validateWalletInterface, validateType } from "./validation"
import {
  WritableStore,
  WalletInterfaceStore,
  WalletInterface,
  WalletStateSliceStore,
  StateSyncer,
  BalanceStore
} from "./interfaces"

const { default: Cancelable } = require("promise-cancelable")

export const app: WritableStore = writable({
  dappId: "",
  networkId: 1,
  version: "",
  mobileDevice: false,
  darkMode: false,
  walletSelectInProgress: false,
  walletSelectCompleted: false,
  walletReadyInProgress: false,
  walletReadyCompleted: false
})

export const balanceSyncStatus: {
  syncing: null | Promise<undefined>
  error: string
} = {
  syncing: null,
  error: ""
}

export const address: WalletStateSliceStore = createWalletStateSliceStore({
  parameter: "address",
  initialState: null
})
export const network: WalletStateSliceStore = createWalletStateSliceStore({
  parameter: "network",
  initialState: null
})
export const balance: BalanceStore = createBalanceStore("")
export const wallet: WritableStore = writable({
  name: null,
  provider: null,
  connect: null,
  instance: null
})

export const state = derived(
  [address, network, balance, wallet, app],
  ([$address, $network, $balance, $wallet, $app]) => {
    return {
      address: $address,
      network: $network,
      balance: $balance,
      wallet: $wallet,
      mobileDevice: $app.mobileDevice
    }
  }
)

// keep track of intervals that are syncing state so they can be cleared
let currentSyncerIntervals: (number | undefined)[] = []

export const walletInterface: WalletInterfaceStore = createWalletInterfaceStore(
  null
)

walletInterface.subscribe((walletInterface: WalletInterface | null) => {
  if (walletInterface) {
    // reset state
    address.reset()
    network.reset()

    // clear all current intervals if they exist
    currentSyncerIntervals.forEach(
      (interval: number | undefined) => interval && clearInterval(interval)
    )

    // start syncing state and save intervals
    currentSyncerIntervals = [
      address.setStateSyncer(walletInterface.address),
      network.setStateSyncer(walletInterface.network),
      balance.setStateSyncer(walletInterface.balance)
    ]
  }
})

function createWalletInterfaceStore(
  initialState: null | WalletInterface
): WalletInterfaceStore {
  const { subscribe, set, update } = writable(initialState)

  return {
    subscribe,
    update,
    set: (walletInterface: WalletInterface) => {
      validateWalletInterface(walletInterface)
      set(walletInterface)
    }
  }
}

function createWalletStateSliceStore(options: {
  parameter: string
  initialState: string | number | null
}): WalletStateSliceStore {
  const { parameter, initialState } = options
  const { subscribe, set } = writable(initialState)

  return {
    subscribe,
    reset: () => set(initialState),
    setStateSyncer: (stateSyncer: StateSyncer) => {
      validateType({ name: "stateSyncer", value: stateSyncer, type: "object" })

      const { get, onChange } = stateSyncer

      validateType({
        name: `${parameter}.get`,
        value: get,
        type: "function",
        optional: true
      })

      validateType({
        name: `${parameter}.onChange`,
        value: onChange,
        type: "function",
        optional: true
      })

      if (onChange) {
        onChange(set)
        return
      }

      if (get) {
        const interval: any = setInterval(() => {
          get()
            .then(set)
            .catch((err: any) => {
              throw new Error(
                `Error getting ${parameter} from state syncer: ${err}`
              )
            })
        }, 200)

        return interval
      }
    }
  }
}

function createBalanceStore(initialState: string): BalanceStore {
  let stateSyncer: StateSyncer
  let emitter

  const { subscribe } = derived([address, network], ([$address], set) => {
    if (stateSyncer && !stateSyncer.onChange) {
      if ($address && stateSyncer.get && set) {
        syncStateWithTimeout({
          getState: stateSyncer.get,
          setState: set,
          timeout: 2000
        })
        const blocknative = getBlocknative()
        emitter = blocknative.account(blocknative.clientIndex, $address).emitter
        emitter.on("txConfirmed", () => {
          stateSyncer.get &&
            syncStateWithTimeout({
              getState: stateSyncer.get,
              setState: set,
              timeout: 2000
            })
          return false
        })
        emitter.on("all", () => false)
      } else {
        // no address, so set balance back to null
        set && set(initialState)
      }
    }
  })

  return {
    subscribe,
    setStateSyncer: (syncer: StateSyncer) => {
      validateType({ name: "syncer", value: syncer, type: "object" })

      const { get, onChange } = syncer

      validateType({
        name: "balance.get",
        value: get,
        type: "function",
        optional: true
      })

      validateType({
        name: "balance.onChange",
        value: onChange,
        type: "function",
        optional: true
      })

      stateSyncer = syncer

      return undefined
    }
  }
}

function syncStateWithTimeout(options: {
  getState: () => Promise<string | number | null>
  setState: (newState: string) => void
  timeout: number
}) {
  const { getState, setState, timeout } = options
  const prom = makeQuerablePromise(
    new Cancelable(
      (
        resolve: (val: string | number | null) => void,
        reject: (err: any) => void,
        onCancel: (callback: () => void) => void
      ) => {
        getState().then(resolve)

        onCancel(() => {
          balanceSyncStatus.error =
            "There was a problem getting the balance of this wallet"
        })
      }
    )
  )

  balanceSyncStatus.syncing = prom

  prom
    .then((result: string) => {
      if (result) {
        setState(result)
      }
    })
    .catch(() => {})

  const timedOut = wait(timeout)

  timedOut.then(() => {
    if (!prom.isFulfilled()) {
      prom.cancel()
    }
  })
}
