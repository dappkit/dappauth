<script lang="ts">
  import BigNumber from "bignumber.js";
  import { onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { fade } from "svelte/transition";

  import { app, walletInterface, wallet } from "../stores";

  import Modal from "../components/Modal.svelte";
  import ModalHeader from "../components/ModalHeader.svelte";
  import Wallets from "../components/Wallets.svelte";
  import SelectedWallet from "../components/SelectedWallet.svelte";
  import Button from "../elements/Button.svelte";
  import IconButton from "../elements/IconButton.svelte";
  import walletIcon from "../elements/walletIcon";

  import {
    getProviderName,
    createLegacyProviderInterface,
    createModernProviderInterface
  } from "../utilities";

  import {
    SelectModalData,
    AppState,
    WalletModule,
    WalletSelectModule,
    WalletInterface
  } from "../interfaces";

  export let module: WalletSelectModule = {
    heading: "",
    description: "",
    wallets: {
      mobile: [],
      desktop: []
    }
  };

  let modalData: SelectModalData | null;
  let showWalletDefinition: boolean;
  let walletAlreadyInstalled: string | undefined;
  let installMessage: string | undefined;

  let selectedWalletModule: WalletModule;

  const { mobileDevice } = get(app);
  const { heading, description, wallets } = module;
  const deviceWallets = wallets[mobileDevice ? "mobile" : "desktop"];

  let primaryWallets: WalletModule[];
  let secondaryWallets: WalletModule[] | undefined;

  let appState: AppState = {
    dappId: "",
    networkId: 1,
    version: "",
    mobileDevice: false,
    darkMode: false,
    autoSelectWallet: "",
    walletSelectInProgress: true,
    walletSelectCompleted: false,
    walletReadyInProgress: false,
    walletReadyCompleted: false
  };

  const unsubscribe = app.subscribe((store: AppState) => (appState = store));

  onDestroy(unsubscribe);

  $: if (appState.autoSelectWallet) {
    const module = deviceWallets.find(
      (m: WalletModule) => m.name === appState.autoSelectWallet
    );
    module && handleWalletSelect(module);
  } else {
    if (deviceWallets.find(wallet => wallet.preferred)) {
      // if preferred wallets, then split in to preferred and not preferred
      primaryWallets = deviceWallets.filter(wallet => wallet.preferred);
      secondaryWallets = deviceWallets.filter(wallet => !wallet.preferred);
    } else {
      // otherwise make the first 4 wallets preferred
      primaryWallets = deviceWallets.slice(0, 4);
      secondaryWallets =
        deviceWallets.length > 4 ? deviceWallets.slice(4) : undefined;
    }

    modalData = {
      heading,
      description,
      primaryWallets,
      secondaryWallets
    };
  }

  function handleWalletSelect(module: WalletModule) {
    const {
      provider,
      interface: selectedWalletInterface,
      instance
    } = module.wallet({
      getProviderName,
      createLegacyProviderInterface,
      createModernProviderInterface,
      BigNumber
    });

    // if no interface then the user does not have the wallet they selected installed or available
    if (!selectedWalletInterface) {
      selectedWalletModule = module;

      walletAlreadyInstalled = provider && getProviderName(provider);

      installMessage =
        module.installMessage &&
        module.installMessage({
          currentWallet: walletAlreadyInstalled || "unknown",
          selectedWallet: selectedWalletModule.name
        });

      return;
    }

    walletInterface.update((currentInterface: WalletInterface | null) => {
      if (currentInterface && currentInterface.disconnect) {
        currentInterface.disconnect();
      }

      return selectedWalletInterface;
    });

    wallet.set({
      provider,
      instance,
      name: module.name,
      connect: selectedWalletInterface.connect,
      loading: selectedWalletInterface.loading
    });

    finish({ completed: true });
  }

  function finish(options: { completed: boolean }) {
    modalData = null;

    app.update(store => ({
      ...store,
      walletSelectInProgress: false,
      walletSelectCompleted: options.completed,
      autoSelect: false
    }));
  }
</script>

<style>
  /* .bn-onboard-select-description, .bn-onboard-select-wallet-definition */
  p {
    font-size: 0.889rem;
    margin: 1rem 0 0 0;
    font-family: "Helvetica Neue";
  }

  /* .bn-onboard-select-info-container */
  div {
    display: flex;
    justify-content: space-between;
  }

  /* .bn-onboard-select-wallet-info */
  div span {
    color: #4a90e2;
    margin-top: 0.66rem;
    cursor: pointer;
  }
</style>

{#if modalData}
  <Modal closeModal={() => finish({ completed: false })}>
    <ModalHeader icon={walletIcon} heading={modalData.heading} />
    {#if !selectedWalletModule}
      <p class="bn-onboard-custom bn-onboard-select-description">
        {modalData.description}
      </p>
      <Wallets {modalData} {handleWalletSelect} />
      <div class="bn-onboard-custom bn-onboard-select-info-container">
        <span
          class="bn-onboard-custom bn-onboard-select-wallet-info"
          on:click={() => (showWalletDefinition = !showWalletDefinition)}>
          What is a wallet?
        </span>
        {#if mobileDevice}
          <Button onclick={() => finish({ completed: false })}>Dismiss</Button>
        {/if}
      </div>
      {#if showWalletDefinition}
        <p
          in:fade
          class="bn-onboard-custom bn-onboard-select-wallet-definition">
          Wallets are used to send, receive, and store digital assets like
          Ethereum. Wallets come in many forms. They are either built into your
          browser, an extension added to your browser, a piece of hardware
          plugged into your computer or even an app on your phone. They are
          hyper secure, and can be used for any other blockchain application you
          may want to use.
        </p>
      {/if}
    {:else}
      <SelectedWallet
        {selectedWalletModule}
        onBack={() => {
          selectedWalletModule = null;
          walletAlreadyInstalled = null;
        }}
        {installMessage} />
    {/if}
  </Modal>
{/if}
