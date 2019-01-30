import React from 'react'
import { storiesOf } from '@storybook/react'
import { linkTo } from '@storybook/addon-links'
import { State, Store } from '@sambego/storybook-state'
import { Modal } from 'components/UI'
import { Syncing } from 'components/Syncing'
import { boolean, number, select } from '@storybook/addon-knobs'
import { Window } from '../helpers'

const store = new Store({
  address: '2MxZ2z7AodL6gxEgwL5tkq2imDBhkBMq2Jc',
  blockHeight: 123123,
  lndBlockHeight: 1000,
  lndCfilterHeight: 100,
  isLoading: false
})

const setIsWalletOpen = () => ({})
const showNotification = () => ({})

storiesOf('Containers.Syncing', module)
  .addParameters({
    info: {
      disable: true
    }
  })
  .addDecorator(story => (
    <Window>
      <Modal withHeader onClose={linkTo('Containers.Home', 'Home')} pb={0} px={0}>
        {story()}
      </Modal>
    </Window>
  ))
  .add('Syncing', () => {
    const hasSynced = boolean('Has synced', false)
    const syncPercentage = number('Sync Percentage', 30)
    const syncStatus = select('Sync Status', ['waiting', 'in-progress', 'complete'], 'in-progress')
    return (
      <State store={store}>
        {state => (
          <Syncing
            // State
            hasSynced={hasSynced}
            syncPercentage={syncPercentage}
            syncStatus={syncStatus}
            address={state.address}
            blockHeight={state.blockHeight}
            lndBlockHeight={state.lndBlockHeight}
            lndCfilterHeight={state.lndCfilterHeight}
            isLoading={state.isLoading}
            // Dispatch
            setIsWalletOpen={setIsWalletOpen}
            showNotification={showNotification}
          />
        )}
      </State>
    )
  })
