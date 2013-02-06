Package.describe({
  summary: "Toolkit for live-updating HTML interfaces",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'uuid', 'domutils', 'liverange', 'universal-events'],
          'client');

  api.add_files(['shark.js'], 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['shark', 'test-helpers'], 'client');

  api.add_files([
    'shark_tests.js'
  ], 'client');
});
