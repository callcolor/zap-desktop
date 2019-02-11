import React from 'react'
import PropTypes from 'prop-types'
import { Form, Select } from 'components/UI'

const ChannelFilter = ({ changeFilter, filter, filters, ...rest }) => {
  // Reformat channel filters the way that Select element expects them to be.
  const items = filters.map(f => {
    return {
      key: f.key,
      value: f.name
    }
  })

  return (
    <Form {...rest}>
      <Select
        field="channel-filter"
        id="channel-filter"
        items={items}
        initialSelectedItem={filter}
        onValueSelected={changeFilter}
        highlightOnValid={false}
      />
    </Form>
  )
}

ChannelFilter.propTypes = {
  changeFilter: PropTypes.func.isRequired,
  filter: PropTypes.string,
  filters: PropTypes.array
}

ChannelFilter.defaultProps = {
  filters: []
}

export default ChannelFilter
