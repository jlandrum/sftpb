module.exports = function(grunt) {
  grunt.initConfig({
    exec: {
      npm: 'npm install -g .',
    },
    watch: {
      files: ['Gruntfile.js', 'lib/**/*.js'],
      tasks: ['exec:npm']
    }
  });

  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-exec');
};
